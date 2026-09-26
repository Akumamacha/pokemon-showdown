import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { TeamValidator } from '../sim/team-validator';
import { type PRNGSeed } from '../sim/prng';
import { evaluateParties, type BattleRecord, type RunBattle } from './battle-evaluator';
import {
	PLAYER_AI, PLAYER_SETTINGS, printEvaluationConfig, selectionDescription, type EvaluationConfig,
} from './experiment-config';
import { displayParty, pokemonName } from './pokemon-display';
import { deriveSeed, experimentRNG, SEED_SCHEME } from './experiment-rng';
import { buildRandomParty, mutateParty } from './party-builder';

export interface ExperimentConfig extends EvaluationConfig {
	experimentSeed: string;
	generations: number;
}

interface Counts {
	currentWins: number;
	candidateWins: number;
	draws: number;
	unknown: number;
	errors: number;
}

export interface GenerationRecord {
	generation: number;
	mutationSeed: PRNGSeed;
	mutation: { slot: number, from: string, to: string }[];
	currentParty: PokemonSet[];
	candidateParty: PokemonSet[];
	battleSeeds: PRNGSeed[];
	battles: BattleRecord[];
	result: Counts;
	accepted: boolean | null;
	status: 'running' | 'completed' | 'failed';
}

export interface ExperimentRecord {
	schemaVersion: 2;
	id: string;
	startedAt: string;
	finishedAt?: string;
	software: { gitCommit: string | null, gitDirty: boolean | null, node: string };
	experiment: ExperimentConfig;
	ai: { current: string, candidate: string, currentSelection: string, candidateSelection: string };
	// schema 2への任意の追加項目。旧記録にない方針は推測せず、保存commitで確認する。
	playerBehavior?: { current: string, candidate: string };
	policy: { seats: string, acceptance: string, move: number, mega: number };
	rng: { scheme: string, partySeed: PRNGSeed, battleDerivation: string };
	initialParty: PokemonSet[];
	generations: GenerationRecord[];
	finalParty: PokemonSet[];
	status: 'running' | 'completed' | 'failed';
	error?: string;
}

function softwareInfo(): ExperimentRecord['software'] {
	// shellを介さず固定引数で取得する。Gitなしでも実験は行い、取得不能をnullで残す。
	const info: ExperimentRecord['software'] = { gitCommit: null, gitDirty: null, node: process.version };
	try {
		const options = { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' as const, timeout: 5000, windowsHide: true };
		info.gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], options).trim();
		info.gitDirty = !!execFileSync('git', ['status', '--porcelain'], options).trim();
	} catch {}
	return info;
}

/** 完成したJSONを一時ファイルから置換し、保存途中の破損を避ける。 */
function saveRecord(file: string, record: ExperimentRecord): void {
	writeFileSync(`${file}.tmp`, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
	renameSync(`${file}.tmp`, file);
}

/** 対戦がすべて成功した後だけ、同期処理で採否と最終Partyを更新する。 */
function finishGeneration(record: ExperimentRecord, entry: GenerationRecord): void {
	entry.accepted = entry.result.candidateWins > entry.result.currentWins;
	entry.status = 'completed';
	record.finalParty = structuredClone(entry.accepted ? entry.candidateParty : entry.currentParty);
}

/** Milestone 11と同じ評価・採用条件で、seedと全探索経路を記録する。 */
export async function runExperiment(
	config: ExperimentConfig,
	outputDirectory = path.resolve('ai-project/experiments'),
	runBattle?: RunBattle,
): Promise<{ record: ExperimentRecord, file: string }> {
	// WP01の設定に選出指定がない場合は旧AIの選出を保ち、保存時には明示する。
	const settings = { ...structuredClone(config),
		currentSelection: config.currentSelection ?? 'legacy', candidateSelection: config.candidateSelection ?? 'legacy',
	};
	printEvaluationConfig(settings);
	if (!Number.isSafeInteger(settings.generations) || settings.generations < 1) {
		throw new Error('世代数は正の整数で指定してください');
	}
	const partySeed = deriveSeed(settings.experimentSeed, 'party');
	const startedAt = new Date().toISOString();
	const id = `milestone11-${startedAt.replace(/[:.]/g, '-')}-${randomUUID()}`;
	// 入力文字列を直接ファイル名に使わず、区切り文字や長さによる問題を防ぐ。
	const file = path.resolve(outputDirectory, `${id}-seed-${partySeed.slice(5)}.json`);
	const record: ExperimentRecord = {
		schemaVersion: 2, id, startedAt, software: softwareInfo(), experiment: settings,
		ai: {
			current: PLAYER_AI[settings.currentAI].name,
			candidate: PLAYER_AI[settings.candidateAI].name,
			currentSelection: selectionDescription(settings.currentAI, settings.currentSelection),
			candidateSelection: selectionDescription(settings.candidateAI, settings.candidateSelection),
		},
		playerBehavior: {
			current: PLAYER_AI[settings.currentAI].behavior, candidate: PLAYER_AI[settings.candidateAI].behavior,
		},
		policy: { seats: 'Current=Bot 1, Candidate=Bot 2', acceptance: 'candidateWins > currentWins', ...PLAYER_SETTINGS },
		rng: {
			scheme: SEED_SCHEME, partySeed,
			battleDerivation: 'deriveSeed(experimentSeed, "battle", generation, game); Runner.prng -> Battle + both Player AI seeds',
		},
		initialParty: [], generations: [], finalParty: [], status: 'running',
	};
	mkdirSync(outputDirectory, { recursive: true });
	saveRecord(file, record);
	console.log(`【再現可能な探索を開始】\nExperiment Seed: ${settings.experimentSeed}\n世代数: ${settings.generations}\n実験記録: ${file}`);
	try {
		const validator = new TeamValidator(settings.format);
		const validate = (party: PokemonSet[]) => {
			const problems = validator.validateTeam(party);
			if (problems) throw new Error(`Party検証失敗: ${problems.join('; ')}`);
		};
		// 初期生成の乱数系列はMutation・Battleから独立させる。
		const initial = buildRandomParty(experimentRNG(settings.experimentSeed, 'party'));
		validate(initial);
		record.initialParty = structuredClone(initial);
		console.log(`初期パーティ: ${displayParty(initial)}`);
		record.finalParty = structuredClone(initial);
		saveRecord(file, record);
		for (let generation = 1; generation <= settings.generations; generation++) {
			const current = structuredClone(record.finalParty);
			const mutationSeed = deriveSeed(settings.experimentSeed, 'mutation', generation);
			const candidate = mutateParty(current, experimentRNG(settings.experimentSeed, 'mutation', generation));
			const entry: GenerationRecord = {
				generation, mutationSeed,
				mutation: candidate.flatMap((set, i) => set.species === current[i].species ? [] : [{
					slot: i + 1, from: current[i].species, to: set.species,
				}]),
				currentParty: structuredClone(current), candidateParty: candidate,
				battleSeeds: Array.from({ length: settings.games }, (_, i) =>
					deriveSeed(settings.experimentSeed, 'battle', generation, i + 1)),
				battles: [], result: { currentWins: 0, candidateWins: 0, draws: 0, unknown: 0, errors: 0 },
				accepted: null, status: 'running',
			};
			record.generations.push(entry);
			validate(candidate);
			saveRecord(file, record);
			const mutationText = entry.mutation.map(m => `${pokemonName(m.from)} → ${pokemonName(m.to)}`).join(', ');
			console.log(`【第${generation}世代】変異: ${mutationText}`);
			const result = await evaluateParties(current, candidate, settings, false, runBattle, {
				seeds: entry.battleSeeds,
				onBattle: battle => {
					entry.battles.push(battle);
					for (const side of ['current', 'candidate'] as const) {
						const selected = battle.selections?.[side];
						if (selected) console.log(`第${battle.game}試合 ${side} 選出（先頭が先発）: ` +
							selected.species.map((s, i) => `${pokemonName(s)} Lv.${selected.levels[i]}`).join(', '));
					}
					const key = {
						current: 'currentWins', candidate: 'candidateWins', draw: 'draws', unknown: 'unknown', error: 'errors',
					} as const;
					entry.result[key[battle.outcome]]++;
					// 異常終了でも直前までの結果を保持する。強制終了時はrunningのまま残る。
					saveRecord(file, record);
				},
			});
			finishGeneration(record, entry);
			saveRecord(file, record);
			console.log(`Current勝利: ${result.currentWins}; Candidate勝利: ${result.candidateWins}; Draw: ${result.draws}\n判定: ${entry.accepted ? 'Candidateを採用' : 'Currentを維持'}`);
		}
		record.status = 'completed';
		record.finishedAt = new Date().toISOString();
		saveRecord(file, record);
		console.log(`【探索完了】\n最終パーティ: ${displayParty(record.finalParty)}\n実験記録: ${file}`);
		return { record, file };
	} catch (error) {
		record.status = 'failed';
		record.error = String(error);
		record.finishedAt = new Date().toISOString();
		const last = record.generations[record.generations.length - 1];
		if (last?.status === 'running') last.status = 'failed';
		saveRecord(file, record);
		throw new Error(`探索異常終了。実験記録: ${file}; ${String(error)}`);
	}
}
