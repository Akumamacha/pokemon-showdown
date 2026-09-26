import { createPokemonSet } from './pokemon-set';
import { evaluateParties } from './battle-evaluator';
import { type EvaluationConfig } from './experiment-config';

const partyA = [
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

const partyB = [
	{
		name: 'Snorlax',
		species: 'Snorlax',
		item: 'Leftovers',
		moves: ['Body Slam', 'Earthquake', 'Rest', 'Sleep Talk'],
		level: 55,
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
].map(set => createPokemonSet(set));

const NUMBER_OF_GAMES = 100;

const evaluationConfig: EvaluationConfig = {
	format: 'gen2nc2000',
	currentAI: 'random',
	candidateAI: 'random',
	games: NUMBER_OF_GAMES,
};

async function main() {
	console.log('=== Milestone 6 ===');
	console.log('Party A vs Party B');
	console.log(`Battles: ${NUMBER_OF_GAMES}`);
	console.log('');

	// 共通Evaluatorを使い、古い実験でも結果不明をdrawへ混ぜない。
	const { currentWins: partyAWins, candidateWins: partyBWins, draws, elapsedSeconds } =
		await evaluateParties(partyA, partyB, evaluationConfig, true);

	console.log('');
	console.log('=== Milestone 6 Result ===');
	console.log(`Battles:      ${NUMBER_OF_GAMES}`);
	console.log(`Party A wins: ${partyAWins}`);
	console.log(`Party B wins: ${partyBWins}`);
	console.log(`Draws:        ${draws}`);
	console.log('');
	console.log(`Party A win rate: ${(partyAWins / NUMBER_OF_GAMES * 100).toFixed(1)}%`);
	console.log(`Party B win rate: ${(partyBWins / NUMBER_OF_GAMES * 100).toFixed(1)}%`);
	console.log('');
	console.log(`Elapsed: ${elapsedSeconds.toFixed(2)} seconds`);
	console.log(`Average: ${(elapsedSeconds / NUMBER_OF_GAMES).toFixed(3)} seconds/battle`);

	const totalResults = partyAWins + partyBWins + draws;

	if (totalResults !== NUMBER_OF_GAMES) {
		throw new Error(
			`Result count mismatch: expected ${NUMBER_OF_GAMES}, got ${totalResults}`
		);
	}
}

main().catch(error => {
	console.error(error);
	process.exit(1);
});
