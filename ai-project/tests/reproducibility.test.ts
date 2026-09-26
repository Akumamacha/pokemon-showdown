import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { PRNG } from '../../sim/prng';
import { Runner } from '../../sim/tools/runner';
import { TeamValidator } from '../../sim/team-validator';
import { deriveSeed, experimentRNG } from '../experiment-rng';
import { runExperiment, type ExperimentConfig, type ExperimentRecord } from '../experiment';
import { buildRandomParty, mutateParty, pokemonPool } from '../party-builder';
import { createPlayerOptions } from '../experiment-config';
import { evaluateParties, type RunBattle } from '../battle-evaluator';

const config: ExperimentConfig = {
	format: 'gen2nc2000', currentAI: 'random', candidateAI: 'random',
	experimentSeed: 'wp01-regression-2026', generations: 3, games: 4,
};

function tempDirectory() {
	// 失敗時に人間が記録を確認できるよう、Git対象外の実験ディレクトリへ残す。
	mkdirSync(path.resolve('ai-project/experiments'), { recursive: true });
	return mkdtempSync(path.resolve('ai-project/experiments/test-'));
}

/** 実行ID・日時だけは異なる。探索条件と全経路は丸ごと比較する。 */
function reproducible(record: ExperimentRecord) {
	const { id, startedAt, finishedAt, ...rest } = record;
	return rest;
}

void test('同じseedは初期Party・Mutation・乱数列を再現し、用途と別seedでは列が変わる', () => {
	const first = buildRandomParty(experimentRNG('same', 'party'));
	assert.deepEqual(first, buildRandomParty(experimentRNG('same', 'party')));
	const before = structuredClone(first);
	const poolBefore = structuredClone(pokemonPool);
	const mutation = mutateParty(first, experimentRNG('same', 'mutation', 1));
	assert.deepEqual(mutation, mutateParty(first, experimentRNG('same', 'mutation', 1)));
	assert.deepEqual(first, before);
	mutation[0].moves[0] = 'Toxic';
	mutation[0].evs.hp = 1;
	assert.deepEqual(first, before);
	assert.deepEqual(pokemonPool, poolBefore);
	const sequence = (seed: string, label: string) => {
		const rng = experimentRNG(seed, label);
		return Array.from({ length: 10 }, () => rng.random());
	};
	assert.deepEqual(sequence('same', 'party'), sequence('same', 'party'));
	assert.notDeepEqual(sequence('same', 'party'), sequence('different', 'party'));
	assert.notDeepEqual(sequence('same', 'party'), sequence('same', 'mutation'));
	assert.throws(() => deriveSeed(''), /Experiment Seed/);
});

void test('実Runner: 同じBattle seedと条件から両AIを含む対戦ログ全体を再現する', async () => {
	const party = buildRandomParty(experimentRNG(config.experimentSeed, 'party'));
	assert.equal(new TeamValidator(config.format).validateTeam(party), null);
	const run = async () => {
		const chunks: string[] = [];
		await new Runner({
			format: config.format, prng: deriveSeed(config.experimentSeed, 'battle', 1, 1),
			p1options: createPlayerOptions('random', party), p2options: createPlayerOptions('random', party),
			onChunk: chunk => { chunks.push(chunk); },
		}).run();
		// Battleログの壁時計だけは戦闘内容ではないので比較から除く。
		return chunks.join('\n').split('\n').filter(line => !line.startsWith('|t:|')).join('\n');
	};
	const first = await run();
	assert.match(first, /\|win\||\|tie\|/);
	assert.equal(first, await run());
});

void test('実Runner: 小規模探索を2回実行し、初期Partyから全世代・各Battle・採否・最終Partyまで一致', async t => {
	// 明示seed経路から暗黙の乱数生成へ戻ると即座に検出する。
	t.mock.method(Math, 'random', () => { throw new Error('Unmanaged Math.random'); });
	t.mock.method(PRNG, 'generateSeed', () => { throw new Error('Unmanaged PRNG seed'); });
	const a = await runExperiment(config, tempDirectory());
	const b = await runExperiment(config, tempDirectory());
	assert.deepEqual(reproducible(a.record), reproducible(b.record));
	assert.deepEqual(JSON.parse(readFileSync(a.file, 'utf8')), a.record);
	assert.equal(a.record.status, 'completed');
	assert.equal(a.record.generations.length, config.generations);
	assert.equal(a.record.initialParty.length, 6);
	assert.equal(a.record.finalParty.length, 6);
	assert.ok(a.record.startedAt && a.record.finishedAt && a.record.software.node);
	assert.match(a.record.software.gitCommit!, /^[a-f0-9]{40}$/);
	assert.equal(typeof a.record.software.gitDirty, 'boolean');
	assert.equal(a.record.ai.current, 'RandomPlayerAI');
	assert.ok(a.record.ai.currentSelection && a.record.ai.candidateSelection);
	assert.equal(a.record.policy.acceptance, 'candidateWins > currentWins');
	for (const generation of a.record.generations) {
		assert.equal(generation.mutation.length, 1);
		assert.equal(generation.battles.length, config.games);
		assert.equal(generation.currentParty.length, 6);
		assert.equal(generation.candidateParty.length, 6);
		assert.equal(generation.status, 'completed');
		assert.equal(generation.result.unknown + generation.result.errors, 0);
		assert.equal(generation.result.currentWins + generation.result.candidateWins + generation.result.draws, config.games);
		assert.equal(generation.accepted, generation.result.candidateWins > generation.result.currentWins);
		for (const battle of generation.battles) {
			assert.equal(battle.runnerSeed, deriveSeed(config.experimentSeed, 'battle', generation.generation, battle.game));
		}
	}
});

void test('Unknown/Errorでも完了済み試合と異常を保存し、Drawや採否へ混入しない', async () => {
	for (const failure of ['unknown', 'error', 'invalid'] as const) {
		const directory = tempDirectory();
		let calls = 0;
		const run: RunBattle = options => {
			assert.ok(options.prng);
			if (++calls === 1) options.onChunk?.('|tie|');
			else if (failure === 'error') throw new Error('injected failure');
			else if (failure === 'invalid') options.onChunk?.('|win|unexpected');
			return Promise.resolve();
		};
		await assert.rejects(runExperiment(config, directory, run), /探索異常終了/);
		const record: ExperimentRecord = JSON.parse(readFileSync(path.join(directory, readdirSync(directory)[0]), 'utf8'));
		assert.equal(calls, 2);
		assert.equal(record.status, 'failed');
		assert.ok(record.error && record.finishedAt);
		assert.equal(record.generations.length, 1);
		const generation = record.generations[0];
		assert.equal(generation.status, 'failed');
		assert.equal(generation.accepted, null);
		assert.deepEqual(record.finalParty, record.initialParty);
		assert.equal(generation.result.draws, 1);
		assert.equal(generation.result.unknown, failure === 'unknown' ? 1 : 0);
		assert.equal(generation.result.errors, failure === 'unknown' ? 0 : 1);
		assert.equal(generation.battles.length, 2);
		assert.ok(generation.battles[1].error);
	}
});

void test('採用後のPartyが次世代へ渡り、同点・負けでは維持される', async () => {
	let game = 0;
	const record = (await runExperiment({ ...config, games: 2 }, tempDirectory(), options => {
		const lines = ['|win|Bot 2', '|win|Bot 2', '|win|Bot 1', '|win|Bot 2', '|win|Bot 1', '|win|Bot 1'];
		options.onChunk?.(lines[game++]);
		return Promise.resolve();
	})).record;
	assert.deepEqual(record.generations.map(g => g.accepted), [true, false, false]);
	assert.deepEqual(record.generations[1].currentParty, record.generations[0].candidateParty);
	assert.deepEqual(record.generations[2].currentParty, record.generations[1].currentParty);
	assert.deepEqual(record.finalParty, record.generations[0].candidateParty);
});

void test('seedの欠落や個数不一致で暗黙乱数のBattleを開始しない', async () => {
	const neverRun: RunBattle = () => { assert.fail('Battle must not start'); };
	for (const seeds of [[], Array(4)]) {
		await assert.rejects(evaluateParties([], [], config, false, neverRun, {
			seeds, onBattle: () => {},
		}), /seed/);
	}
});
