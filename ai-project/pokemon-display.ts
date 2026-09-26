import { toID } from '../sim/dex';
import { PokedexText } from '../data/text/ja/pokedex';

/** 表示だけを翻訳する。内部species・保存JSON・Battleログには触れない。 */
export function pokemonName(species: string): string {
	const id = toID(species);
	return Object.prototype.hasOwnProperty.call(PokedexText, id) ? PokedexText[id].name || species : species;
}

export function displayParty(party: readonly { species: string, level: number }[]): string {
	return party.map(p => `${pokemonName(p.species)} Lv.${p.level}`).join(', ');
}
