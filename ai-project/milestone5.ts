import { Runner } from '../sim/tools/runner';

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

const NUMBER_OF_GAMES = 100;

async function main() {
	console.log(`Starting ${NUMBER_OF_GAMES} battles...`);

	const startTime = Date.now();

	for (let i = 1; i <= NUMBER_OF_GAMES; i++) {
		const runner = new Runner({
			format: 'gen2nc2000',
			p1options: { team },
			p2options: { team },
			output: false,
			error: true,
		});

		await runner.run();

		if (i % 10 === 0 || i === NUMBER_OF_GAMES) {
			console.log(`${i}/${NUMBER_OF_GAMES} battles completed`);
		}
	}

	const elapsedSeconds = (Date.now() - startTime) / 1000;

	console.log('');
	console.log('=== Milestone 5 Complete ===');
	console.log(`Battles: ${NUMBER_OF_GAMES}`);
	console.log(`Elapsed: ${elapsedSeconds.toFixed(2)} seconds`);
	console.log(`Average: ${(elapsedSeconds / NUMBER_OF_GAMES).toFixed(3)} seconds/battle`);
}

main().catch(error => {
	console.error(error);
	process.exit(1);
});