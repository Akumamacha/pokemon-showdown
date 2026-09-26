import { Runner } from '../sim/tools/runner';
import { createPokemonSet } from './pokemon-set';
import { createPlayerOptions, printEvaluationConfig, type EvaluationConfig } from './experiment-config';

const team = [
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
].map(set => createPokemonSet(set));

// AIと選出方式は実験開始時に表示し、Runnerにも同じ設定を渡す。
const evaluationConfig: EvaluationConfig = {
	format: 'gen2nc2000',
	currentAI: 'simple',
	candidateAI: 'random',
	games: 1,
};

async function main() {
	printEvaluationConfig(evaluationConfig);

	const runner = new Runner({
		format: evaluationConfig.format,
		p1options: createPlayerOptions(evaluationConfig.currentAI, team),
		p2options: createPlayerOptions(evaluationConfig.candidateAI, team),
		output: true,
		error: true,
	});

	await runner.run();
}

main().catch(error => {
	console.error(error);
	process.exit(1);
});
