import { TeamValidator } from '../sim/team-validator';
import { buildRandomParty, mutateParty } from './party-builder';
import { evaluateParties } from './battle-evaluator';
import { type EvaluationConfig } from './experiment-config';

const NUMBER_OF_GAMES = 100;

/**
 * パーティ内容を見やすく表示する。
 */
function printParty(title: string, party: PokemonSet[]) {
	console.log(title);

	for (let i = 0; i < party.length; i++) {
		const pokemon = party[i];

		console.log(
			`  ${i + 1}. ${pokemon.name} Lv.${pokemon.level} @ ${pokemon.item}`
		);
	}

	console.log('');
}

// Ver.1と同じ操作AIを、暗黙の既定値ではなく設定として指定する。
const evaluationConfig: EvaluationConfig = {
	format: 'gen2nc2000',
	currentAI: 'random',
	candidateAI: 'random',
	games: NUMBER_OF_GAMES,
};

async function main() {
	console.log('=== Milestone 10: Mutation + Battle + Evaluation ===');
	console.log('');

	// ⑨のParty Builderから現在のパーティを作る
	const currentParty = buildRandomParty();

	// 現在のパーティから1匹だけ変異させる
	const candidateParty = mutateParty(currentParty);

	// Showdown自身に両方のパーティの合法性を確認してもらう
	const validator = new TeamValidator(evaluationConfig.format);

	const currentProblems = validator.validateTeam(currentParty);
	const candidateProblems = validator.validateTeam(candidateParty);

	if (currentProblems) {
		console.error('Current Party is illegal:');
		console.error(currentProblems);
		throw new Error('Current Party failed Showdown validation');
	}

	if (candidateProblems) {
		console.error('Candidate Party is illegal:');
		console.error(candidateProblems);
		throw new Error('Candidate Party failed Showdown validation');
	}

	// 変異前後のパーティを表示する
	printParty('Current Party:', currentParty);
	printParty('Candidate Party:', candidateParty);

	// 本当に1匹だけ変化したか確認する
	let differences = 0;

	for (let i = 0; i < currentParty.length; i++) {
		if (currentParty[i].species !== candidateParty[i].species) {
			differences++;

			console.log(
				`Mutation: slot ${i + 1}: ` +
				`${currentParty[i].species} -> ${candidateParty[i].species}`
			);
		}
	}

	if (differences !== 1) {
		throw new Error(
			`Expected exactly 1 mutation, but found ${differences}`
		);
	}

	console.log('');
	console.log('Showdown NC2000 validation: OK');
	console.log('Exactly one Pokemon was mutated: OK');
	console.log('');

	console.log(`Starting ${NUMBER_OF_GAMES} battles...`);
	console.log('');

	// CurrentとCandidateを実際に100試合戦わせる
	const result = await evaluateParties(
		currentParty,
		candidateParty,
		evaluationConfig,
		true,
	);

	// 全試合の結果数が正しいか確認する
	const totalResults =
		result.currentWins +
		result.candidateWins +
		result.draws;

	if (totalResults !== NUMBER_OF_GAMES) {
		throw new Error(
			`Result count mismatch: expected ${NUMBER_OF_GAMES}, got ${totalResults}`
		);
	}

	console.log('');
	console.log('=== Milestone 10 Result ===');
	console.log(`Battles:        ${NUMBER_OF_GAMES}`);
	console.log(`Current wins:   ${result.currentWins}`);
	console.log(`Candidate wins: ${result.candidateWins}`);
	console.log(`Draws:          ${result.draws}`);
	console.log('');

	console.log(
		`Current win rate:   ${(result.currentWins / NUMBER_OF_GAMES * 100).toFixed(1)}%`
	);

	console.log(
		`Candidate win rate: ${(result.candidateWins / NUMBER_OF_GAMES * 100).toFixed(1)}%`
	);

	console.log('');
	console.log(`Elapsed: ${result.elapsedSeconds.toFixed(2)} seconds`);

	console.log(
		`Average: ${(result.elapsedSeconds / NUMBER_OF_GAMES).toFixed(3)} seconds/battle`
	);

	console.log('');

	// Ver.1では単純に勝利数が多い方を高く評価する
	if (result.candidateWins > result.currentWins) {
		console.log('Evaluation: Candidate Party scored higher.');
	} else if (result.candidateWins < result.currentWins) {
		console.log('Evaluation: Current Party scored higher.');
	} else {
		console.log('Evaluation: Equal score.');
	}
}

main().catch(error => {
	console.error(error);
	process.exit(1);
});
