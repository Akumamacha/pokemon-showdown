import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { Runner, type RunnerOptions } from '../sim/tools/runner';
import { type PRNGSeed } from '../sim/prng';
import { createPlayerOptions, type PlayerAIKind } from './experiment-config';
import { deriveSeed } from './experiment-rng';
import { displayParty } from './pokemon-display';
import { pokemonPool } from './party-builder';
import { type SelectionMode, type SelectedTeam } from './team-selection';

export type BenchmarkSeat = 'target-bot1' | 'target-bot2';
export type BenchmarkOutcome = 'target' | 'baseline' | 'draw' | 'unknown' | 'error';

export interface BenchmarkConfig {
	format: 'gen2nc2000';
	experimentSeed: string;
	games: number;
	targetParty: PokemonSet[];
	targetAI: PlayerAIKind;
	targetSelection: SelectionMode;
	baselineAI: PlayerAIKind;
	baselineSelection: SelectionMode;
}

export interface BenchmarkBattle {
	game: number;
	seed: PRNGSeed;
	seat: BenchmarkSeat;
	outcome: BenchmarkOutcome;
	error?: string;
	selections?: { target?: SelectedTeam, baseline?: SelectedTeam };
}

interface Counts { targetWins: number; baselineWins: number; draws: number; unknown: number; errors: number }
interface BenchmarkCondition {
	baselineId: string;
	baselineParty: PokemonSet[];
	seat: BenchmarkSeat;
	battles: BenchmarkBattle[];
	result: Counts;
}

export interface BenchmarkRecord {
	schemaVersion: 1;
	kind: 'common-benchmark';
	id: string;
	startedAt: string;
	finishedAt?: string;
	software: { gitCommit: string | null, gitDirty: boolean | null, node: string };
	config: Omit<BenchmarkConfig, 'targetParty'>;
	targetParty: PokemonSet[];
	baselines: { id: string, rationale: string, party: PokemonSet[], ai: PlayerAIKind, selection: SelectionMode }[];
	seed: { scheme: string, derivation: string };
	conditions: BenchmarkCondition[];
	status: 'running' | 'completed' | 'failed';
	error?: string;
}

export const BENCHMARK_VERSION = 'fixed-pool-v1';

/** 登録順の機械的な2 fixture。代表性や強さは主張せず、条件を固定するために使う。 */
export function benchmarkBaselines(ai: PlayerAIKind, selection: SelectionMode) {
	return [
		{ id: 'registration-first6', rationale: '固定11セットの登録順1〜6。任意の強さを主張しない機械的fixture。', party: structuredClone(pokemonPool.slice(0, 6)), ai, selection },
		{ id: 'registration-last6', rationale: '固定11セットの登録順6〜11。任意の強さを主張しない機械的fixture。', party: structuredClone(pokemonPool.slice(5, 11)), ai, selection },
	];
}

function softwareInfo(): BenchmarkRecord['software'] {
	const info: BenchmarkRecord['software'] = { gitCommit: null, gitDirty: null, node: process.version };
	try {
		const options = { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' as const, timeout: 5000, windowsHide: true };
		info.gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], options).trim();
		info.gitDirty = !!execFileSync('git', ['status', '--porcelain'], options).trim();
	} catch {}
	return info;
}

function saveRecord(file: string, record: BenchmarkRecord) {
	writeFileSync(`${file}.tmp`, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
	renameSync(`${file}.tmp`, file);
}

function parseOutcome(line: string, seat: BenchmarkSeat): BenchmarkOutcome {
	if (line === '|tie|') return 'draw';
	if (line === '|win|Bot 1') return seat === 'target-bot1' ? 'target' : 'baseline';
	if (line === '|win|Bot 2') return seat === 'target-bot2' ? 'target' : 'baseline';
	return 'unknown';
}

async function runBattle(record: BenchmarkRecord, condition: BenchmarkCondition, game: number) {
	const target = structuredClone(record.targetParty);
	const baseline = structuredClone(condition.baselineParty);
	const selections: NonNullable<BenchmarkBattle['selections']> = {};
	let terminal = '';
	const targetOptions = createPlayerOptions(record.config.targetAI, target, record.config.targetSelection,
		selected => { selections.target = selected; }, baseline);
	const baselineOptions = createPlayerOptions(record.config.baselineAI, baseline, record.config.baselineSelection,
		selected => { selections.baseline = selected; }, target);
	const seed = deriveSeed(record.config.experimentSeed, 'benchmark', condition.baselineId, condition.seat, game);
	const targetIsP1 = condition.seat === 'target-bot1';
	const options: RunnerOptions = {
		format: record.config.format, prng: seed,
		p1options: targetIsP1 ? { ...targetOptions, team: structuredClone(targetOptions.team) } : { ...baselineOptions, team: structuredClone(baselineOptions.team) },
		p2options: targetIsP1 ? { ...baselineOptions, team: structuredClone(baselineOptions.team) } : { ...targetOptions, team: structuredClone(targetOptions.team) },
		error: true,
		onChunk: chunk => {
			for (const line of chunk.split('\n')) if (line.startsWith('|win|') || line === '|tie|') terminal = line;
		},
	};
	let outcome: BenchmarkOutcome;
	try {
		await new Runner(options).run();
		outcome = parseOutcome(terminal, condition.seat);
		if (outcome === 'unknown') throw new Error('Unknown result (missing win/tie log)');
	} catch (error) {
		outcome = terminal ? parseOutcome(terminal, condition.seat) : 'error';
		if (outcome !== 'target' && outcome !== 'baseline' && outcome !== 'draw') outcome = 'error';
		condition.battles.push({ game, seed, seat: condition.seat, outcome, error: String(error), selections });
		return;
	}
	condition.battles.push({ game, seed, seat: condition.seat, outcome, selections });
}

function addCount(result: Counts, outcome: BenchmarkOutcome) {
	if (outcome === 'target') result.targetWins++;
	else if (outcome === 'baseline') result.baselineWins++;
	else if (outcome === 'draw') result.draws++;
	else if (outcome === 'unknown') result.unknown++;
	else result.errors++;
}

export async function runBenchmark(config: BenchmarkConfig, outputDirectory = path.resolve('ai-project/experiments')) {
	if (!config || config.format !== 'gen2nc2000') throw new Error('Benchmark format must be gen2nc2000');
	if (!Number.isSafeInteger(config.games) || config.games < 1) throw new Error('Benchmark games must be a positive integer');
	if (config.targetParty.length !== 6) throw new Error('Benchmark targetParty must contain 6 Pokémon');
	const baselines = benchmarkBaselines(config.baselineAI, config.baselineSelection);
	const startedAt = new Date().toISOString();
	const id = `benchmark-${startedAt.replace(/[:.]/g, '-')}-${randomUUID()}`;
	const file = path.resolve(outputDirectory, `${id}-seed-${deriveSeed(config.experimentSeed, 'benchmark').slice(5)}.json`);
	const record: BenchmarkRecord = {
		schemaVersion: 1, kind: 'common-benchmark', id, startedAt, software: softwareInfo(),
		config: { ...structuredClone(config), targetParty: undefined } as unknown as BenchmarkRecord['config'],
		targetParty: structuredClone(config.targetParty), baselines: baselines.map(b => ({ ...b, party: structuredClone(b.party) })),
		seed: { scheme: 'wp01-sha256-gen5-v1', derivation: 'deriveSeed(experimentSeed, "benchmark", baselineId, seat, game)' },
		conditions: [], status: 'running',
	};
	// targetPartyはconfigから除外した型に合わせ、保存条件では常にrecord.targetPartyを参照する。
	delete (record.config as { targetParty?: unknown }).targetParty;
	mkdirSync(outputDirectory, { recursive: true });
	saveRecord(file, record);
	console.log(`【共通Benchmark開始】\n対象Party: ${displayParty(record.targetParty)}\n記録: ${file}`);
	try {
		for (const baseline of baselines) for (const seat of ['target-bot1', 'target-bot2'] as const) {
			const condition: BenchmarkCondition = { baselineId: baseline.id, baselineParty: structuredClone(baseline.party), seat,
				battles: [], result: { targetWins: 0, baselineWins: 0, draws: 0, unknown: 0, errors: 0 } };
			record.conditions.push(condition);
			for (let game = 1; game <= config.games; game++) {
				await runBattle(record, condition, game);
				addCount(condition.result, condition.battles.at(-1)!.outcome);
				saveRecord(file, record);
			}
			console.log(`${baseline.id} ${seat}: 対象${condition.result.targetWins} / 基準${condition.result.baselineWins} / 引分${condition.result.draws}`);
		}
			record.status = 'completed';
			record.finishedAt = new Date().toISOString();
			saveRecord(file, record);
		return { record, file };
	} catch (error) {
		record.status = 'failed'; record.error = String(error); record.finishedAt = new Date().toISOString(); saveRecord(file, record); throw error;
	}
}
