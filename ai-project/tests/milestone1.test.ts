import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ObjectReadWriteStream } from '../../lib/streams';
import { Battle } from '../../sim/battle';
import { Dex } from '../../sim/dex';
import { type ChoiceRequest } from '../../sim/side';
import { TeamValidator } from '../../sim/team-validator';
import { Runner } from '../../sim/tools/runner';
import { RandomPlayerAI } from '../../sim/tools/random-player-ai';
import { evaluateParties, parseBattleOutcome, type RunBattle } from '../battle-evaluator';
import { createPlayerOptions, printEvaluationConfig, type EvaluationConfig } from '../experiment-config';
import { buildRandomParty, mutateParty, pokemonPool } from '../party-builder';
import { createPokemonSet } from '../pokemon-set';
import { SimplePlayerAI } from '../simple-player-ai';

const config: EvaluationConfig = {
	format: 'gen2nc2000', currentAI: 'random', candidateAI: 'random', games: 3,
};

function fixedParty(): PokemonSet[] {
	return structuredClone(pokemonPool.slice(0, 6));
}

void test('入力の補完は従来のEVを維持し、入力の配列を共有しない', () => {
	const input = {
		name: 'Zapdos', species: 'Zapdos', item: 'Mint Berry',
		moves: ['Thunderbolt', 'Hidden Power Ice', 'Rest', 'Sleep Talk'], level: 50,
	};
	const direct = createPokemonSet(input);
	const validated = createPokemonSet(input, 252);
	assert.equal(direct.evs.hp, 0);
	assert.equal(validated.evs.hp, 252);
	assert.equal(validated.ivs.atk, 31);
	const party = fixedParty();
	party[1] = validated;
	assert.equal(new TeamValidator(config.format).validateTeam(party), null);
	assert.equal(validated.hpType, 'Ice');
	assert.equal(Dex.forFormat(config.format).getHiddenPower(validated.ivs).type, 'Ice');
	direct.moves[0] = 'Toxic';
	assert.equal(input.moves[0], 'Thunderbolt');
	assert.equal(validated.moves[0], 'Thunderbolt');
});

void test('従来の146組が合法で、生成と1匹交換も成立する', () => {
	const validator = new TeamValidator(config.format);
	const before = structuredClone(pokemonPool);
	let count = 0;
	for (let mask = 0; mask < 2 ** pokemonPool.length; mask++) {
		const party = pokemonPool.filter((_, i) => mask & (1 << i));
		if (party.length !== 6 || new Set(party.map(p => p.item)).size !== 6) continue;
		assert.equal(validator.validateTeam(structuredClone(party)), null);
		count++;
	}
	assert.equal(count, 146);
	for (let i = 0; i < 100; i++) {
		const current = buildRandomParty();
		const candidate = mutateParty(current);
		assert.equal(current.length, 6);
		assert.equal(candidate.length, 6);
		assert.equal(current.filter((p, j) => p.species !== candidate[j].species).length, 1);
		assert.equal(validator.validateTeam(current), null);
		assert.equal(validator.validateTeam(candidate), null);
	}
	assert.deepEqual(pokemonPool, before);
});

void test('Current / Candidate / 別パーティ / 候補プールの中身を共有しない', () => {
	const poolBefore = structuredClone(pokemonPool);
	const current = buildRandomParty();
	const other = buildRandomParty();
	const otherBefore = structuredClone(other);
	const candidate = mutateParty(current);
	const candidateBefore = structuredClone(candidate);
	assert.equal(new TeamValidator(config.format).validateTeam(current), null);
	assert.deepEqual(candidate, candidateBefore);
	assert.deepEqual(pokemonPool, poolBefore);

	current[0].moves[0] = 'Toxic';
	current[0].evs.hp = 1;
	current[0].ivs.atk = 2;
	assert.deepEqual(candidate, candidateBefore);
	const currentBefore = structuredClone(current);
	for (const set of candidate) {
		set.moves[0] = 'Protect';
		set.evs.hp = 3;
		set.ivs.atk = 4;
	}
	assert.deepEqual(current, currentBefore);
	assert.deepEqual(other, otherBefore);
	assert.deepEqual(pokemonPool, poolBefore);
});

void test('明示したAI生成処理と、従来の選出方式が一致する', () => {
	const party = fixedParty();
	const battle = new Battle({
		formatid: Dex.formats.get(config.format).id,
		p1: { name: 'Bot 1', team: structuredClone(party) },
		p2: { name: 'Bot 2', team: structuredClone(party) },
	});
	try {
		const request = battle.p1.activeRequest;
		assert.ok(request?.teamPreview);
		for (const kind of ['random', 'simple'] as const) {
			const choices: string[] = [];
			const stream = new ObjectReadWriteStream<string>({ write: choice => { choices.push(choice); } });
			const options = createPlayerOptions(kind, party);
			const ai = options.createAI(stream, options);
			assert.equal(ai.constructor, kind === 'random' ? RandomPlayerAI : SimplePlayerAI);
			ai.receiveRequest(request);
			assert.deepEqual(choices, [kind === 'random' ? 'default' : 'team 256']);
			assert.equal(options.move, 0.7);
		}
		battle.makeChoices('default', 'team 256');
		assert.deepEqual(battle.p1.pokemon.map(p => p.species.name), ['Zapdos', 'Cloyster', 'Exeggutor']);
		assert.deepEqual(battle.p2.pokemon.map(p => p.species.name), ['Zapdos', 'Marowak', 'Starmie']);
	} finally {
		battle.destroy();
	}
});

void test('評価開始ログからAI・選出・Format・試合数を確認できる', t => {
	const lines: string[] = [];
	t.mock.method(console, 'log', (line: string) => { lines.push(line); });
	printEvaluationConfig({ ...config, candidateAI: 'simple' });
	const log = lines.join('\n');
	assert.match(log, /Format: gen2nc2000/);
	assert.match(log, /Current AI \(Bot 1\): RandomPlayerAI; Selection: default/);
	assert.match(log, /Candidate AI \(Bot 2\): SimplePlayerAI; Selection: team 256/);
	assert.match(log, /Games per evaluation: 3/);
});

void test('不正な試合数やJavaScriptからのAI未指定を実行前に拒否する', async () => {
	const run: RunBattle = () => { assert.fail('Invalid config must not start a battle'); };
	for (const games of [0, -1, 1.5, NaN, Infinity]) {
		await assert.rejects(evaluateParties([], [], { ...config, games }, false, run), /positive integer/);
	}
	// Reflect経由で型検査のない呼び出しを再現する。実装の型を弱めない。
	for (const bad of [
		{ format: config.format, games: 1 },
		{ ...config, candidateAI: 'typo' },
		{ ...config, currentAI: 'toString' },
	]) {
		await assert.rejects(Reflect.apply(evaluateParties, undefined, [[], [], bad, false, run]), /Player AI/);
	}
});

void test('両側のAI指定をRunnerへ渡し、実際のdrawだけを集計する', async () => {
	const party = fixedParty();
	const before = structuredClone(party);
	const logs = ['|win|Bot 1', '|win|Bot 2', '|tie|'];
	let calls = 0;
	const run: RunBattle = options => {
		assert.equal(options.format, config.format);
		assert.ok(options.p1options?.createAI);
		assert.ok(options.p2options?.createAI);
		assert.ok(options.p1options.team);
		// Battle側による書き換えが次の試合や入力パーティへ漏れないことも確認する。
		assert.deepEqual(options.p1options.team, before);
		options.p1options.team[0].moves[0] = 'Toxic';
		options.onChunk?.(`|turn|1\n${logs[calls++]}\n`);
		return Promise.resolve();
	};
	const result = await evaluateParties(party, party, config, false, run);
	assert.equal(calls, 3);
	assert.equal(result.currentWins, 1);
	assert.equal(result.candidateWins, 1);
	assert.equal(result.draws, 1);
	assert.deepEqual(party, before);
});

void test('欠落・未知の勝者・矛盾する終局・実行エラーで評価を停止する', async () => {
	assert.equal(parseBattleOutcome(''), 'unknown');
	assert.equal(parseBattleOutcome('|win|someone'), 'unknown');
	for (const lines of ['', '|win|someone', '|win|Bot 1\n|tie|']) {
		let calls = 0;
		const run: RunBattle = options => {
			calls++;
			options.onChunk?.(lines);
			return Promise.resolve();
		};
		await assert.rejects(evaluateParties([], [], config, false, run), /Unknown result|Invalid battle result/);
		assert.equal(calls, 1);
	}
	await assert.rejects(evaluateParties([], [], config, false, () => {
		return Promise.reject(new Error('simulated simulator failure'));
	}), /Battle 1\/3 failed:.*simulated simulator failure/);
});

void test('Evaluator smoke: 実際のRunnerで両側の指定AIが動き、6試合を完走する', async t => {
	const current = fixedParty();
	const candidate = structuredClone(current);
	candidate[2] = structuredClone(pokemonPool[7]);
	const validator = new TeamValidator(config.format);
	assert.equal(validator.validateTeam(current), null);
	assert.equal(validator.validateTeam(candidate), null);
	const before = structuredClone([current, candidate]);
	// 暗黙のRunner既定AIへ戻ったら失敗させる。製品のseed管理は追加しない。
	t.mock.method(Runner.AI_OPTIONS, 'createAI', () => { throw new Error('Implicit AI fallback'); });
	const original = RandomPlayerAI.prototype.receiveRequest;
	const observed = new Set<string>();
	t.mock.method(RandomPlayerAI.prototype, 'receiveRequest', function (this: RandomPlayerAI, request: ChoiceRequest) {
		if (!request.wait) observed.add(`${request.side.id}:${this.constructor.name}`);
		return original.call(this, request);
	});
	for (const [currentAI, candidateAI] of [
		['random', 'random'], ['simple', 'random'], ['random', 'simple'],
	] as const) {
		observed.clear();
		const result = await evaluateParties(current, candidate, { ...config, currentAI, candidateAI, games: 2 });
		assert.equal(result.currentWins + result.candidateWins + result.draws, 2);
		assert.ok(observed.has(`p1:${currentAI === 'random' ? 'RandomPlayerAI' : 'SimplePlayerAI'}`));
		assert.ok(observed.has(`p2:${candidateAI === 'random' ? 'RandomPlayerAI' : 'SimplePlayerAI'}`));
	}
	assert.deepEqual([current, candidate], before);
});
