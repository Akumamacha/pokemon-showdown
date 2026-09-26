import { Battle } from '../sim/battle';
import { Dex } from '../sim/dex';
import { TeamValidator } from '../sim/team-validator';

export type SelectionMode = 'legacy' | 'default' | 'first-legal' | 'simple-counter';
export interface SelectedTeam {
	slots: number[];
	species: string[];
	levels: number[];
	selection?: SelectionDecision;
}
export interface SelectionDecision {
	mode: 'simple-counter';
	score: number;
	reason: string;
	opponentSpecies: string[];
	opponentLevels: number[];
}
export interface SelectionCandidate {
	slots: number[];
	totalLevel: number;
	problems: string[];
}

/** 公開Previewだけを使う、説明可能な小規模スコア。詳細なダメージ計算は行わない。 */
export function chooseSimpleCounter(party: PokemonSet[], opponent: PokemonSet[]): {
	slots: number[], score: number, reason: string, opponentSpecies: string[], opponentLevels: number[],
} {
	const candidates = enumerateSelections(party);
	const opponentSpecies = opponent.map(set => set.species);
	const opponentLevels = opponent.map(set => set.level);
	if (candidates.partyProblems.length || opponent.length !== 6 || !candidates.legal.length) {
		if (!candidates.legal.length) throw new Error(`合法な選出がありません: ${candidates.partyProblems.join('; ')}`);
		return {
			slots: candidates.legal[0].slots, score: 0,
			reason: '相手Previewが欠損したため、最初の合法候補へ安全にフォールバック',
			opponentSpecies, opponentLevels,
		};
	}
	const dex = Dex.forFormat('gen2nc2000');
	const scoreMoves = (set: PokemonSet, targets: PokemonSet[]) => {
		let score = 0;
		for (const moveName of set.moves) {
			const move = dex.moves.get(moveName);
			if (!move.exists || move.category === 'Status') continue;
			for (const target of targets) {
				const species = dex.species.get(target.species);
				const effectiveness = dex.getEffectiveness(move.type, species.types);
				score += effectiveness;
			}
		}
		return score;
	};
	const scoreSpeciesTypes = (species: string, targets: PokemonSet[]) => {
		const sourceTypes = dex.species.get(species).types;
		return targets.reduce((score, target) => score + sourceTypes.reduce((sum, type) =>
			sum + dex.getEffectiveness(type, dex.species.get(target.species).types), 0), 0);
	};
	const scored = candidates.legal.map(candidate => {
		const offensive = candidate.slots.reduce((sum, slot) => sum + scoreMoves(party[slot - 1], opponent), 0);
		// 防御側は相手の技を見ず、Previewで公開される相手speciesのtypeだけを使う。
		const defensive = candidate.slots.reduce((sum, slot) => sum - opponent.reduce((inner, target) =>
			inner + scoreSpeciesTypes(target.species, [party[slot - 1]]), 0), 0);
		return { candidate, score: offensive + defensive };
	});
	scored.sort((a, b) => b.score - a.score || a.candidate.totalLevel - b.candidate.totalLevel ||
		a.candidate.slots.join(',').localeCompare(b.candidate.slots.join(',')));
	const winner = scored[0];
	const lead = [...winner.candidate.slots].sort((a, b) => {
		const diff = scoreMoves(party[b - 1], opponent) - scoreMoves(party[a - 1], opponent);
		return diff || a - b;
	})[0];
	const slots = [lead, ...winner.candidate.slots.filter(slot => slot !== lead)];
	return {
		slots, score: winner.score,
		reason: `公開Previewへの簡易相性スコア（攻撃範囲−被攻撃範囲）=${winner.score}; 同点は低合計Lv・slot順`,
		opponentSpecies, opponentLevels,
	};
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
