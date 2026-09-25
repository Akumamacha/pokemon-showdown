import { Runner } from '../sim/tools/runner';
import { SimplePlayerAI } from './simple-player-ai';

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
];

async function main() {

	const runner = new Runner({
	format: 'gen2nc2000',
	p1options: {
		team,
		createAI: (stream, options) => new SimplePlayerAI(stream, options),
	},

	p2options: {
		team,
	},

	output: true,
	error: true,
});

	await runner.run();
}

main().catch(error => {
	console.error(error);
	process.exit(1);
});