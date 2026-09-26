import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runBenchmark } from '../benchmark';
import { pokemonPool } from '../party-builder';

const config = {
	format: 'gen2nc2000' as const, experimentSeed: 'wp05-test', games: 1,
	targetParty: structuredClone(pokemonPool.slice(0, 6)), targetAI: 'simple' as const,
	targetSelection: 'simple-counter' as const, baselineAI: 'random' as const,
	baselineSelection: 'first-legal' as const,
};

void test('共通Benchmarkは2基準相手×両座席を記録し、実選出とseedを分離する', async () => {
	const result = await runBenchmark(config, mkdtempSync('ai-project/experiments/wp05-'));
	assert.equal(result.record.kind, 'common-benchmark');
	assert.equal(result.record.schemaVersion, 1);
	assert.equal(result.record.conditions.length, 4);
	assert.deepEqual(new Set(result.record.conditions.map(c => c.baselineId)),
		new Set(['registration-first6', 'registration-last6']));
	assert.deepEqual(new Set(result.record.conditions.map(c => c.seat)), new Set(['target-bot1', 'target-bot2']));
	const battles = result.record.conditions.flatMap(c => c.battles);
	assert.equal(battles.length, 4);
	assert.equal(new Set(battles.map(b => b.seed)).size, 4);
	for (const battle of battles) {
		assert.ok(battle.selections?.target?.slots.length === 3);
		assert.ok(battle.selections?.baseline?.slots.length === 3);
		assert.equal(battle.outcome === 'error' || battle.outcome === 'unknown', false);
		assert.equal(battle.selections?.target?.selection?.mode, 'simple-counter');
	}
	assert.deepEqual(JSON.parse(readFileSync(result.file, 'utf8')), result.record);
});

void test('同じBenchmark設定はIDと時刻を除いて再現し、不正設定は開始前に拒否する', async () => {
	const a = await runBenchmark(config, mkdtempSync('ai-project/experiments/wp05-a-'));
	const b = await runBenchmark(config, mkdtempSync('ai-project/experiments/wp05-b-'));
	const normalize = (record: typeof a.record) => { const { id, startedAt, finishedAt, ...rest } = record; return rest; };
	assert.deepEqual(normalize(a.record), normalize(b.record));
	await assert.rejects(runBenchmark({ ...config, games: 0 }, mkdtempSync('ai-project/experiments/wp05-invalid-')), /positive integer/);
	await assert.rejects(runBenchmark({ ...config, targetParty: pokemonPool.slice(0, 3) }, mkdtempSync('ai-project/experiments/wp05-invalid-')), /6 Pokémon/);
});
