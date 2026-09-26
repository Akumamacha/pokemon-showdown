import { pokemonName } from './pokemon-display';
import { TeamValidator } from '../sim/team-validator';
import { buildRandomParty } from './party-builder';

const NUMBER_OF_PARTIES = 1000;

function main() {
	console.log('=== Milestone 9: Party Builder ===');
	console.log(`Generating and validating ${NUMBER_OF_PARTIES} parties...`);
	console.log('');

	const validator = new TeamValidator('gen2nc2000');

	for (let i = 1; i <= NUMBER_OF_PARTIES; i++) {
		const party = buildRandomParty();

		const problems = validator.validateTeam(party);

		if (problems) {
			console.error(`Party ${i} is illegal:`);
			for (const problem of problems) {
				console.error(`  ${problem}`);
			}

			console.error('');
			console.error('Party contents:');
			for (const pokemon of party) {
				console.error(
					`  ${pokemonName(pokemon.species)} Lv.${pokemon.level} @ ${pokemon.item}`
				);
			}

			throw new Error(`Party ${i} failed Showdown validation`);
		}

		if (i <= 5) {
			console.log(`Party ${i}:`);
			for (const pokemon of party) {
				console.log(
					`  ${pokemonName(pokemon.species)} Lv.${pokemon.level} @ ${pokemon.item}`
				);
			}
			console.log('  Showdown validation: OK');
			console.log('');
		}
	}

	console.log(
		`All ${NUMBER_OF_PARTIES} parties passed Showdown NC2000 validation.`
	);
}

main();
