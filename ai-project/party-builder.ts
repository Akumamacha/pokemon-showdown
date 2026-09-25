export const pokemonPool: PokemonSet[] = [
	{
		name: 'Snorlax',
		species: 'Snorlax',
		item: 'Leftovers',
		moves: ['Body Slam', 'Earthquake', 'Rest', 'Sleep Talk'],
		level: 55,
	},
	{
		name: 'Zapdos',
		species: 'Zapdos',
		item: 'Mint Berry',
		moves: ['Thunderbolt', 'Hidden Power Ice', 'Rest', 'Sleep Talk'],
		level: 50,
	},
	{
		name: 'Cloyster',
		species: 'Cloyster',
		item: 'Gold Berry',
		moves: ['Surf', 'Ice Beam', 'Spikes', 'Explosion'],
		level: 50,
	},
	{
		name: 'Exeggutor',
		species: 'Exeggutor',
		item: 'Miracle Berry',
		moves: ['Psychic', 'Giga Drain', 'Sleep Powder', 'Explosion'],
		level: 50,
	},
	{
		name: 'Marowak',
		species: 'Marowak',
		item: 'Thick Club',
		moves: ['Earthquake', 'Rock Slide', 'Hidden Power Bug', 'Swords Dance'],
		level: 50,
	},
	{
		name: 'Starmie',
		species: 'Starmie',
		item: 'Never-Melt Ice',
		moves: ['Surf', 'Psychic', 'Recover', 'Thunder Wave'],
		level: 50,
	},
	{
		name: 'Raikou',
		species: 'Raikou',
		item: 'Mint Berry',
		moves: ['Thunderbolt', 'Hidden Power Ice', 'Rest', 'Sleep Talk'],
		level: 50,
	},
	{
		name: 'Suicune',
		species: 'Suicune',
		item: 'Gold Berry',
		moves: ['Surf', 'Ice Beam', 'Rest', 'Sleep Talk'],
		level: 50,
	},
	{
		name: 'Machamp',
		species: 'Machamp',
		item: 'Scope Lens',
		moves: ['Cross Chop', 'Rock Slide', 'Earthquake', 'Curse'],
		level: 50,
	},
	{
		name: 'Gengar',
		species: 'Gengar',
		item: 'Miracle Berry',
		moves: ['Thunderbolt', 'Ice Punch', 'Hypnosis', 'Explosion'],
		level: 50,
	},
	{
		name: 'Skarmory',
		species: 'Skarmory',
		item: 'Quick Claw',
		moves: ['Drill Peck', 'Toxic', 'Rest', 'Whirlwind'],
		level: 50,
	},
];

export function buildRandomParty(): PokemonSet[] {
	const candidates = [...pokemonPool];
	const party: PokemonSet[] = [];
	const usedItems = new Set<string>();

	while (party.length < 6) {
		const validCandidates = candidates.filter(
			pokemon => !pokemon.item || !usedItems.has(pokemon.item)
		);

		if (!validCandidates.length) {
			throw new Error('Unable to build a legal 6-Pokemon party');
		}

		const selected =
			validCandidates[Math.floor(Math.random() * validCandidates.length)];

		party.push(selected);

		if (selected.item) {
			usedItems.add(selected.item);
		}

		const index = candidates.indexOf(selected);
		candidates.splice(index, 1);
	}

	return party;
}

/**
 * 現在のパーティから1匹だけ別のポケモンへ交換する。
 *
 * Ver.1では探索を単純にするため、
 * 技・アイテム・レベルは変更せず「ポケモン1匹の交換」だけを変異とする。
 */
export function mutateParty(party: PokemonSet[]): PokemonSet[] {
	// 元のパーティを書き換えないようにコピーする
	const mutatedParty = [...party];

	// 交換する場所をランダムに1か所選ぶ
	const replaceIndex = Math.floor(Math.random() * mutatedParty.length);

	// 現在使われているポケモンのSpeciesを記録する
	// ただし交換対象の1匹は除外する
	const usedSpecies = new Set(
		mutatedParty
			.filter((_, index) => index !== replaceIndex)
			.map(pokemon => pokemon.species)
	);

	// 現在使われているItemを記録する
	// 交換対象の1匹は除外する
	const usedItems = new Set(
		mutatedParty
			.filter((_, index) => index !== replaceIndex)
			.map(pokemon => pokemon.item)
			.filter(item => item)
	);

	// Species ClauseとItem Clauseを破らない交換候補を探す
	const candidates = pokemonPool.filter(pokemon =>
		!usedSpecies.has(pokemon.species) &&
		(!pokemon.item || !usedItems.has(pokemon.item)) &&
		pokemon.species !== party[replaceIndex].species
	);

	if (!candidates.length) {
		throw new Error('No legal mutation candidate found');
	}

	// 合法候補からランダムに1匹選ぶ
	const replacement =
		candidates[Math.floor(Math.random() * candidates.length)];

	mutatedParty[replaceIndex] = replacement;

	return mutatedParty;
}