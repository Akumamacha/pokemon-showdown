import { TeamValidator } from '../sim/team-validator';

// 入力時は省略できる値と、Showdownへ渡す完全な型を区別する。
type DefaultedFields = 'ability' | 'nature' | 'gender' | 'evs' | 'ivs';
export type PokemonSetInput = Omit<PokemonSet, DefaultedFields> & Partial<Pick<PokemonSet, DefaultedFields>>;

/** 入力とは独立したセットを作る。合法性の検証は従来どおりTeamValidatorが担当する。 */
export function createPokemonSet(input: PokemonSetInput, defaultEV = 0): PokemonSet {
	return structuredClone({
		...input,
		ability: input.ability ?? '',
		nature: input.nature ?? '',
		gender: input.gender ?? '',
		evs: input.evs ?? TeamValidator.fillStats(null, defaultEV),
		ivs: input.ivs ?? TeamValidator.fillStats(null, 31),
	});
}
