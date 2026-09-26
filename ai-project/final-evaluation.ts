import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { Runner, type RunnerOptions } from '../sim/tools/runner';
import { type PRNGSeed } from '../sim/prng';
import { TeamValidator } from '../sim/team-validator';
import { createPlayerOptions, type PlayerAIKind } from './experiment-config';
import { deriveSeed } from './experiment-rng';
import { type SelectionMode, type SelectedTeam } from './team-selection';

export interface FinalEvaluationPlan {
	schemaVersion: 1; kind: 'final-evaluation-plan'; version: string; sourceCommit: string;
	format: 'gen2nc2000'; parties: { before: PokemonSet[], after: PokemonSet[] };
	targetAI: PlayerAIKind; targetSelection: SelectionMode; baselineAI: PlayerAIKind; baselineSelection: SelectionMode;
	opponents: { id: string, rationale: string, party: PokemonSet[] }[];
	games: number; seats: ('target-bot1' | 'target-bot2')[];
	seed: { namespace: string, derivation: string }; outcomes: string[];
}
interface Battle { game: number; seed: PRNGSeed; seat: 'target-bot1' | 'target-bot2'; outcome: string; selections: { target?: SelectedTeam, baseline?: SelectedTeam }; error?: string }
interface Condition { partyLabel: 'before' | 'after'; opponentId: string; seat: Battle['seat']; battles: Battle[]; result: Counts }
interface Counts { targetWins: number; baselineWins: number; draws: number; unknown: number; errors: number }
export interface FinalEvaluationRecord {
	schemaVersion: 1; kind: 'final-evaluation'; id: string; startedAt: string; finishedAt?: string;
	software: { gitCommit: string | null, gitDirty: boolean | null, node: string }; plan: FinalEvaluationPlan;
	conditions: Condition[]; status: 'running' | 'completed' | 'failed'; error?: string;
}

function softwareInfo(): FinalEvaluationRecord['software'] {
	const info = { gitCommit: null as string | null, gitDirty: null as boolean | null, node: process.version };
	try {
		const o = { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' as const, timeout: 5000, windowsHide: true };
		info.gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], o).trim();
		info.gitDirty = !!execFileSync('git', ['status', '--porcelain'], o).trim();
	} catch {}
	return info;
}
function save(file: string, record: FinalEvaluationRecord) { writeFileSync(`${file}.tmp`, `${JSON.stringify(record, null, 2)}\n`); renameSync(`${file}.tmp`, file); }
function outcome(line: string, seat: Battle['seat']) {
	if (line === '|tie|') return 'draw';
	if (line === '|win|Bot 1') return seat === 'target-bot1' ? 'target' : 'baseline';
	if (line === '|win|Bot 2') return seat === 'target-bot2' ? 'target' : 'baseline';
	return 'unknown';
}
function count(result: Counts, value: string) {
	if (value === 'target') result.targetWins++; else if (value === 'baseline') result.baselineWins++;
	else if (value === 'draw') result.draws++; else if (value === 'unknown') result.unknown++; else result.errors++;
}

export async function runFinalEvaluation(plan: FinalEvaluationPlan, outputDirectory = path.resolve('ai-project/experiments')) {
	if (plan.schemaVersion !== 1 || plan.kind !== 'final-evaluation-plan') throw new Error('最終評価計画のschemaが不正です');
	if (!Number.isSafeInteger(plan.games) || plan.games < 1) throw new Error('最終評価試合数は正の整数で指定してください');
	if (plan.opponents.length < 2 || plan.seats.length !== 2) throw new Error('最終評価は2基準相手・両座席が必要です');
	const validator = new TeamValidator(plan.format);
	for (const party of [plan.parties.before, plan.parties.after, ...plan.opponents.map(o => o.party)]) {
		if (party.length !== 6) throw new Error('最終評価Partyは6匹必要です');
		const problems = validator.validateTeam(party); if (problems) throw new Error(`最終評価Party検証失敗: ${problems.join('; ')}`);
	}
	const startedAt = new Date().toISOString(); const id = `final-evaluation-${startedAt.replace(/[:.]/g, '-')}-${randomUUID()}`;
	const file = path.resolve(outputDirectory, `${id}.json`); mkdirSync(outputDirectory, { recursive: true });
	const record: FinalEvaluationRecord = { schemaVersion: 1, kind: 'final-evaluation', id, startedAt, software: softwareInfo(), plan, conditions: [], status: 'running' };
	save(file, record);
	console.log(`【独立最終評価開始】\n計画: ${plan.version}\n記録: ${file}`);
	try {
		for (const partyLabel of ['before', 'after'] as const) for (const opponent of plan.opponents) for (const seat of plan.seats) {
			const party = structuredClone(plan.parties[partyLabel]); const baseline = structuredClone(opponent.party);
			const condition: Condition = { partyLabel, opponentId: opponent.id, seat, battles: [], result: { targetWins: 0, baselineWins: 0, draws: 0, unknown: 0, errors: 0 } }; record.conditions.push(condition);
			for (let game = 1; game <= plan.games; game++) {
				const selections: Battle['selections'] = {}; let terminal = '';
				const targetOptions = createPlayerOptions(plan.targetAI, structuredClone(party), plan.targetSelection, x => { selections.target = x; }, baseline);
				const baselineOptions = createPlayerOptions(plan.baselineAI, structuredClone(baseline), plan.baselineSelection, x => { selections.baseline = x; }, party);
				const seed = deriveSeed(plan.seed.namespace, partyLabel, opponent.id, seat, game); const targetP1 = seat === 'target-bot1';
				const options: RunnerOptions = { format: plan.format, prng: seed,
					p1options: targetP1 ? { ...targetOptions, team: structuredClone(targetOptions.team) } : { ...baselineOptions, team: structuredClone(baselineOptions.team) },
					p2options: targetP1 ? { ...baselineOptions, team: structuredClone(baselineOptions.team) } : { ...targetOptions, team: structuredClone(targetOptions.team) }, error: true,
					onChunk: chunk => { for (const line of chunk.split('\n')) if (line.startsWith('|win|') || line === '|tie|') terminal = line; },
				};
				let value = 'unknown'; let error: string | undefined;
				try {
					await new Runner(options).run();
					value = outcome(terminal, seat);
					if (value === 'unknown') throw new Error('終局結果がありません');
				} catch (e) {
					value = terminal ? outcome(terminal, seat) : 'error';
					if (!['target', 'baseline', 'draw'].includes(value)) value = 'error';
					error = String(e);
				}
				condition.battles.push({ game, seed, seat, outcome: value, selections, ...(error ? { error } : {}) });
				count(condition.result, value);
				save(file, record);
			}
			console.log(`${partyLabel} ${opponent.id} ${seat}: 対象${condition.result.targetWins} / 基準${condition.result.baselineWins} / 引分${condition.result.draws}`);
		}
		record.status = 'completed';
		record.finishedAt = new Date().toISOString();
		save(file, record);
		return { record, file };
	} catch (error) {
		record.status = 'failed';
		record.error = String(error);
		record.finishedAt = new Date().toISOString();
		save(file, record);
		throw error;
	}
}
