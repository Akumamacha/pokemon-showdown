import { strict as assert } from 'node:assert';
import { readFileSync, mkdtempSync } from 'node:fs';
import { test } from 'node:test';
import { Runner } from '../../sim/tools/runner';
import { createPlayerOptions } from '../experiment-config';
import { chooseSimpleCounter } from '../team-selection';
import { pokemonPool } from '../party-builder';
import { deriveSeed } from '../experiment-rng';
import { runExperiment } from '../experiment';

const party = () => structuredClone(pokemonPool.slice(0, 6));

void test('simple-counterは公開speciesだけで合法候補を採点し、相手Previewで選出が変わる', () => {
	const current = party();
	const waterWeak = structuredClone(pokemonPool.slice(0, 6));
	const iceWeak = structuredClone(pokemonPool.slice(1, 7));
	const a = chooseSimpleCounter(current, structuredClone(waterWeak));
	const b = chooseSimpleCounter(current, structuredClone(iceWeak));
	assert.equal(a.slots.length, 3);
	assert.equal(b.slots.length, 3);
	assert.notDeepEqual(a.slots, b.slots);
	assert.ok(a.reason.includes('公開Preview'));
	assert.deepEqual(a.opponentSpecies, waterWeak.map(p => p.species));
	assert.deepEqual(a.opponentLevels, waterWeak.map(p => p.level));
	assert.deepEqual(a.slots.sort((x, y) => x - y), [...a.slots].sort((x, y) => x - y));
	assert.deepEqual(chooseSimpleCounter(current, current.slice(0, 3)).slots, [1, 2, 3]);
});

void test('simple-counterはPlayer AIと独立し、random/simpleの両側で実Runnerへ接続する', async () => {
	const current = party();
	const candidate = structuredClone(pokemonPool.slice(5, 11));
	const selected: Record<string, number[]> = {};
	await new Runner({
		format: 'gen2nc2000', prng: deriveSeed('wp04-connection'),
		p1options: createPlayerOptions('random', current, 'simple-counter',
			value => { selected.current = value.slots; }, candidate),
		p2options: createPlayerOptions('simple', candidate, 'simple-counter',
			value => { selected.candidate = value.slots; }, current),
	}).run();
	assert.ok(selected.current && selected.candidate);
	assert.equal(selected.current.length, 3);
	assert.equal(selected.candidate.length, 3);
});

void test('simple-counterの探索記録にscore・理由・公開相手要約を保存し、2回再現する', async () => {
	const config = { format: 'gen2nc2000' as const, experimentSeed: 'wp04-repro', generations: 2, games: 3,
		currentAI: 'random' as const, candidateAI: 'simple' as const,
		currentSelection: 'simple-counter' as const, candidateSelection: 'simple-counter' as const };
	const a = await runExperiment(config, mkdtempSync('ai-project/experiments/wp04-a-'));
	const b = await runExperiment(config, mkdtempSync('ai-project/experiments/wp04-b-'));
	const normalize = (record: typeof a.record) => { const { id, startedAt, finishedAt, ...rest } = record; return rest; };
	assert.deepEqual(normalize(a.record), normalize(b.record));
	for (const generation of a.record.generations) for (const battle of generation.battles) {
		for (const side of ['current', 'candidate'] as const) {
			const decision = battle.selections?.[side]?.selection;
			assert.ok(decision);
			assert.equal(decision.mode, 'simple-counter');
			assert.match(decision.reason, /公開Preview/);
			assert.equal(decision.opponentSpecies.length, 6);
			assert.equal(decision.opponentLevels.length, 6);
		}
	}
	assert.deepEqual(JSON.parse(readFileSync(a.file, 'utf8')), a.record);
});
