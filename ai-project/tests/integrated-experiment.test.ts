import { mkdtempSync, readFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runIntegratedExperiment } from '../integrated-experiment';

const config = {
	format: 'gen2nc2000' as const, experimentSeed: 'wp06-integrated-test', generations: 1, games: 1,
	currentAI: 'simple' as const, candidateAI: 'simple' as const,
	currentSelection: 'simple-counter' as const, candidateSelection: 'simple-counter' as const,
};

void test('探索前後を同じ独立Benchmark条件で測定し、再現する', async () => {
	const a = await runIntegratedExperiment(config, mkdtempSync(path.join(os.tmpdir(), 'wp06-a-')));
	const b = await runIntegratedExperiment(config, mkdtempSync(path.join(os.tmpdir(), 'wp06-b-')));
	assert.equal(a.record.benchmark.before.conditions.length, 4);
	assert.equal(a.record.benchmark.after.conditions.length, 4);
	assert.equal(a.record.benchmark.seed, b.record.benchmark.seed);
	const normalize = (record: typeof a.record) => JSON.parse(JSON.stringify(record, (key, value) =>
		['id', 'startedAt', 'finishedAt', 'file'].includes(key) ? undefined : value));
	assert.deepEqual(normalize(a.record), normalize(b.record));
	assert.deepEqual(JSON.parse(readFileSync(a.file, 'utf8')), a.record);
});
