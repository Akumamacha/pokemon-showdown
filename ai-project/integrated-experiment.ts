import * as path from 'node:path';
import { runBenchmark, type BenchmarkRecord } from './benchmark';
import { runExperiment, type ExperimentConfig, type ExperimentRecord } from './experiment';

export interface IntegratedExperimentRecord {
	schemaVersion: 1;
	kind: 'integrated-experiment';
	experiment: ExperimentRecord;
	benchmark: { seed: string, before: BenchmarkRecord, after: BenchmarkRecord };
}

/** 探索の採否とは独立したseedで、初期Partyと最終Partyを同じBenchmark条件で測る。 */
export async function runIntegratedExperiment(
	config: ExperimentConfig,
	outputDirectory = path.resolve('ai-project/experiments'),
): Promise<{ record: IntegratedExperimentRecord, file: string }> {
	const result = await runExperiment(config, outputDirectory);
	const benchmarkSeed = `${config.experimentSeed}:benchmark`;
	const currentSelection = config.currentSelection ?? 'legacy';
	const candidateSelection = config.candidateSelection ?? 'legacy';
	const common = {
		format: 'gen2nc2000' as const,
		experimentSeed: benchmarkSeed,
		games: config.games,
		targetAI: config.currentAI,
		targetSelection: currentSelection,
		baselineAI: config.candidateAI,
		baselineSelection: candidateSelection,
	};
	if (config.currentAI !== config.candidateAI || currentSelection !== candidateSelection) {
		console.warn('【注意】Current/CandidateのAIまたは選出が異なるため、Party差の根拠として単独解釈しないでください。');
	}
	console.log('【探索前Benchmark】');
	const before = await runBenchmark({ ...common, targetParty: result.record.initialParty }, outputDirectory);
	console.log('【探索後Benchmark】');
	const after = await runBenchmark({ ...common, targetParty: result.record.finalParty }, outputDirectory);
	const file = path.resolve(outputDirectory, `${result.record.id}-integrated.json`);
	const record: IntegratedExperimentRecord = {
		schemaVersion: 1, kind: 'integrated-experiment', experiment: result.record,
		benchmark: { seed: benchmarkSeed, before: before.record, after: after.record },
	};
	const fs = await import('node:fs');
	fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
	return { record, file };
}
