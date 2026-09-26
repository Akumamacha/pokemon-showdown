import { RandomPlayerAI } from '../sim/tools/random-player-ai';
import { type AIOptions } from '../sim/tools/runner';
import { SimplePlayerAI } from './simple-player-ai';
import { enumerateSelections, type SelectionMode, type SelectedTeam } from './team-selection';

export type PlayerAIKind = 'random' | 'simple';

// 実際の生成・表示・記録で同じ設定を使う。旧Random実験の乱数消費を変えない。
export const PLAYER_SETTINGS = { move: 0.7, mega: 0.6 } as const;

// 表示名・選出方式・実際の生成処理を同じ場所で管理し、ログとの食い違いを防ぐ。
export const PLAYER_AI = {
	random: {
		name: 'RandomPlayerAI',
		behavior: 'random-available-move; seeded-random-switch; v1',
		selection: 'default (NC2000: lower levels first, then registration order)',
		createAI: (stream, options) => new RandomPlayerAI(stream, options),
	},
	simple: {
		name: 'SimplePlayerAI',
		behavior: 'first-available-move; seeded-random-switch; v1',
		selection: 'team 256 (slots 2, 5, 6; lead: slot 2)',
		createAI: (stream, options) => new SimplePlayerAI(stream, options),
	},
} satisfies Record<PlayerAIKind, {
	name: string, behavior: string, selection: string, createAI: AIOptions['createAI'],
}>;

export interface EvaluationConfig {
	format: 'gen2nc2000';
	currentAI: PlayerAIKind;
	candidateAI: PlayerAIKind;
	games: number;
	currentSelection?: SelectionMode;
	candidateSelection?: SelectionMode;
}

export function selectionDescription(ai: PlayerAIKind, mode: SelectionMode = 'legacy'): string {
	if (mode === 'legacy') return PLAYER_AI[ai].selection;
	if (mode === 'default') return PLAYER_AI.random.selection;
	if (mode === 'first-legal') return 'first-legal (lexicographic slots; registration order; first slot leads)';
	throw new Error(`Unknown Selection mode: ${mode}`);
}

export function createPlayerOptions(
	ai: PlayerAIKind, team: PokemonSet[], mode: SelectionMode = 'legacy',
	onSelection?: (selected: SelectedTeam) => void,
): AIOptions {
	if (ai !== 'random' && ai !== 'simple') throw new Error(`Unknown or missing Player AI: ${ai}`);
	const preset = PLAYER_AI[ai];
	selectionDescription(ai, mode);
	let command: string | undefined;
	if (mode === 'first-legal') {
		const candidates = enumerateSelections(team);
		if (!candidates.legal.length) throw new Error(`合法な選出がありません: ${candidates.partyProblems.join('; ')}`);
		command = `team ${candidates.legal[0].slots.join(',')}`;
	} else if (mode === 'default') {
		command = 'default';
	}
	const snapshot = structuredClone(team);
	return {
		createAI: (stream, options) => {
			const player = preset.createAI(stream, options);
			const receive = player.receiveRequest.bind(player);
			let preview: string[] = [];
			let recorded = false;
			// 操作AIを変えず、選出要求だけを差し替える。観測はBattle受理後のrequestから行う。
			player.receiveRequest = request => {
				if (!request.wait) {
					const keys = request.side.pokemon.map(p => `${p.ident}|${p.details}`);
					if (request.teamPreview) {
						preview = keys;
						if (command) { player.choose(command); return; }
					} else if (!recorded && preview.length && onSelection) {
						const slots = keys.map(key => preview.indexOf(key) + 1);
						if (slots.length !== 3 || slots.includes(0)) throw new Error('選出結果を特定できません');
						onSelection({
							slots, species: slots.map(slot => snapshot[slot - 1].species),
							levels: slots.map(slot => snapshot[slot - 1].level),
						});
						recorded = true;
					}
				}
				receive(request);
			};
			return player;
		},
		// Ver.1のRunner設定を明記する。交代判断などの戦略は変更しない。
		...PLAYER_SETTINGS,
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
	const currentSelection = selectionDescription(config.currentAI, config.currentSelection);
	const candidateSelection = selectionDescription(config.candidateAI, config.candidateSelection);
	console.log(`Format: ${config.format}`);
	console.log(`Current AI (Bot 1): ${current.name}; Selection: ${currentSelection}`);
	console.log(`Candidate AI (Bot 2): ${candidate.name}; Selection: ${candidateSelection}`);
	console.log(`Games per evaluation: ${config.games}`);
	console.log(`AI move probability: ${PLAYER_SETTINGS.move}; seats: fixed（seed管理は呼び出し元の設定による）`);
	console.log(`操作方針 Current: ${current.behavior}; Candidate: ${candidate.behavior}`);
}
