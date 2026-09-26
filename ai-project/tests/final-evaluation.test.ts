import { mkdtempSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pokemonPool } from '../party-builder';
import { runFinalEvaluation } from '../final-evaluation';

const dummyParty = structuredClone(pokemonPool.slice(0, 6));
const plan = {
	schemaVersion: 1 as const, kind: 'final-evaluation-plan' as const, version: 'wp07-test-fixture', sourceCommit: 'test',
	format: 'gen2nc2000' as const, parties: { before: dummyParty, after: structuredClone(dummyParty) },
	targetAI: 'random' as const, targetSelection: 'first-legal' as const, baselineAI: 'random' as const, baselineSelection: 'first-legal' as const,
	opponents: [{ id: 'dummy', rationale: 'テスト用fixture', party: structuredClone(pokemonPool.slice(5, 11)) },
		{ id: 'dummy-2', rationale: 'テスト用fixture', party: structuredClone([0, 1, 2, 3, 4, 10].map(i => pokemonPool[i])) }],
	games: 1, seats: ['target-bot1', 'target-bot2'] as const,
	seed: { namespace: 'wp07-test-only', derivation: 'test' }, outcomes: ['target', 'baseline', 'draw', 'unknown', 'error'],
};

void test('最終評価fixtureは両Party・両基準・両座席を記録し、異常計画を拒否する', async () => {
	const result = await runFinalEvaluation(plan, mkdtempSync(path.join(os.tmpdir(), 'wp07-final-')));
	assert.equal(result.record.kind, 'final-evaluation');
	assert.equal(result.record.conditions.length, 8);
	assert.ok(result.record.conditions.every(c => c.battles.length === 1));
	assert.equal(result.record.status, 'completed');
	await assert.rejects(runFinalEvaluation({ ...plan, games: 0 }, mkdtempSync(path.join(os.tmpdir(), 'wp07-invalid-'))), /正の整数/);
});
