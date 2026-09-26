import { Battle } from '../sim/battle';
import { Dex } from '../sim/dex';
import { TeamValidator } from '../sim/team-validator';

export type SelectionMode = 'legacy' | 'default' | 'first-legal';
export interface SelectedTeam {
	slots: number[];
	species: string[];
	levels: number[];
}
export interface SelectionCandidate {
	slots: number[];
	totalLevel: number;
	problems: string[];
}

function selectionBattle(party: PokemonSet[]): Battle {
	// 検査用Battleにも固定seedを渡し、探索用乱数を消費しない。
	return new Battle({
		formatid: Dex.formats.get('gen2nc2000').id, seed: 'gen5,0001000200030004',
		p1: { name: 'Bot 1', team: structuredClone(party) },
		p2: { name: 'Bot 2', team: structuredClone(party) },
	});
}

function checkChoice(battle: Battle, slots: readonly number[]): string[] {
	// 省略補完・余分なslotの切捨てを許さず、明示した3匹だけを検査する。
	if (slots.length !== battle.p1.pickedTeamSize()) return ['選出数がルールと一致しません'];
	if (slots.some(slot => !Number.isInteger(slot))) return ['slotは整数で指定してください'];
	const accepted = battle.p1.choose(`team ${slots.join(',')}`);
	return accepted ? [] : [battle.p1.choice.error || '選出が拒否されました'];
}

/** 登録Party全体の合法性と、順序付き選出コマンドの合法性を別々に検査する。 */
export function inspectSelection(party: PokemonSet[], slots: readonly number[]): string[] {
	if (party.length !== 6) return ['登録Partyは6匹必要です'];
	const normalized = structuredClone(party);
	const problems = new TeamValidator('gen2nc2000').validateTeam(normalized);
	if (problems) return problems;
	const battle = selectionBattle(normalized);
	try {
		return checkChoice(battle, slots);
	} finally {
		battle.destroy();
	}
}

/** 組合せは昇順slotで一度だけ列挙。順序の6通りは別の戦略として水増ししない。 */
export function enumerateSelections(party: PokemonSet[]): {
	partyProblems: string[], legal: SelectionCandidate[], rejected: SelectionCandidate[],
} {
	const normalized = structuredClone(party);
	const partyProblems = party.length === 6 ?
		new TeamValidator('gen2nc2000').validateTeam(normalized) || [] : ['登録Partyは6匹必要です'];
	const legal: SelectionCandidate[] = [];
	const rejected: SelectionCandidate[] = [];
	if (partyProblems.length) return { partyProblems, legal, rejected };
	const battle = selectionBattle(normalized);
	try {
		for (let a = 1; a <= 4; a++) {
			for (let b = a + 1; b <= 5; b++) {
				for (let c = b + 1; c <= 6; c++) {
					const slots = [a, b, c];
					const candidate = {
						slots, totalLevel: slots.reduce((sum, slot) => sum + normalized[slot - 1].level, 0),
						problems: checkChoice(battle, slots),
					};
					(candidate.problems.length ? rejected : legal).push(candidate);
				}
			}
		}
	} finally {
		battle.destroy();
	}
	return { partyProblems, legal, rejected };
}
