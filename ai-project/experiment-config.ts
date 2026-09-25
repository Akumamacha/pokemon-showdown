import { RandomPlayerAI } from '../sim/tools/random-player-ai';
import { type AIOptions } from '../sim/tools/runner';
import { SimplePlayerAI } from './simple-player-ai';

export type PlayerAIKind = 'random' | 'simple';

// 表示名・選出方式・実際の生成処理を同じ場所で管理し、ログとの食い違いを防ぐ。
export const PLAYER_AI = {
	random: {
		name: 'RandomPlayerAI',
		selection: 'default (NC2000: lower levels first, then registration order)',
		createAI: (stream, options) => new RandomPlayerAI(stream, options),
	},
	simple: {
		name: 'SimplePlayerAI',
		selection: 'team 256 (slots 2, 5, 6; lead: slot 2)',
		createAI: (stream, options) => new SimplePlayerAI(stream, options),
	},
} satisfies Record<PlayerAIKind, { name: string, selection: string, createAI: AIOptions['createAI'] }>;

export interface EvaluationConfig {
	format: 'gen2nc2000';
	currentAI: PlayerAIKind;
	candidateAI: PlayerAIKind;
	games: number;
}

export function createPlayerOptions(ai: PlayerAIKind, team: PokemonSet[]): AIOptions {
	if (ai !== 'random' && ai !== 'simple') throw new Error(`Unknown or missing Player AI: ${ai}`);
	const preset = PLAYER_AI[ai];
	return {
		createAI: preset.createAI,
		// Ver.1のRunner設定を明記する。交代判断などの戦略は変更しない。
		move: 0.7,
		mega: 0.6,
		team: structuredClone(team),
	};
}

/** 評価前に検証・表示する。JavaScriptからの呼び出しでも未指定を許さない。 */
export function printEvaluationConfig(config: EvaluationConfig): void {
	if (!config || config.format !== 'gen2nc2000') throw new Error('Expected format: gen2nc2000');
	if (!Number.isSafeInteger(config.games) || config.games < 1) throw new Error('Games must be a positive integer');
	for (const ai of [config.currentAI, config.candidateAI]) {
		if (ai !== 'random' && ai !== 'simple') throw new Error('Current and Candidate Player AI must both be specified');
	}
	const current = PLAYER_AI[config.currentAI];
	const candidate = PLAYER_AI[config.candidateAI];
	console.log(`Format: ${config.format}`);
	console.log(`Current AI (Bot 1): ${current.name}; Selection: ${current.selection}`);
	console.log(`Candidate AI (Bot 2): ${candidate.name}; Selection: ${candidate.selection}`);
	console.log(`Games per evaluation: ${config.games}`);
	console.log('AI move probability: 0.7; seats: fixed; seed: not managed');
}
