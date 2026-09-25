import { TeamValidator } from '../sim/team-validator';
import { buildRandomParty, mutateParty } from './party-builder';
import { evaluateParties } from './battle-evaluator';
import { type EvaluationConfig } from './experiment-config';

// Ver.1では10世代だけ探索する。
// まず「探索Loopが最後まで自動で回ること」を優先する。
const NUMBER_OF_GENERATIONS = 10;

// 1世代につき100試合でCurrentとCandidateを比較する。
const GAMES_PER_GENERATION = 100;

// 戦略・選出はVer.1のまま。両者のAIを必須の設定として明記する。
const evaluationConfig: EvaluationConfig = {
	format: 'gen2nc2000',
	currentAI: 'random',
	candidateAI: 'random',
	games: GAMES_PER_GENERATION,
};

/**
 * パーティ内容を表示する。
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

/**
 * 2つのパーティを比較し、
 * どのスロットが変異したかを表示する。
 */
function printMutation(
	currentParty: PokemonSet[],
	candidateParty: PokemonSet[],
) {
	for (let i = 0; i < currentParty.length; i++) {
		if (currentParty[i].species !== candidateParty[i].species) {
			console.log(
				`Mutation: slot ${i + 1}: ` +
				`${currentParty[i].species} -> ${candidateParty[i].species}`
			);
		}
	}
}

async function main() {
	console.log('=== Milestone 11: Automatic Party Search ===');
	console.log('');

	const validator = new TeamValidator(evaluationConfig.format);

	// ⑨のParty Builderから探索開始地点を作る
	let currentParty = buildRandomParty();

	// 初期パーティがNC2000で合法か確認する
	const initialProblems = validator.validateTeam(currentParty);

	if (initialProblems) {
		console.error(initialProblems);
		throw new Error('Initial Party failed Showdown validation');
	}

	console.log('Initial Party:');
	printParty('', currentParty);

	// 指定した世代数だけ自動探索する
	for (
		let generation = 1;
		generation <= NUMBER_OF_GENERATIONS;
		generation++
	) {
		console.log(
			`=== Generation ${generation}/${NUMBER_OF_GENERATIONS} ===`
		);

		// Current Partyから1匹だけ変異させる
		const candidateParty = mutateParty(currentParty);

		// CandidateもShowdownで合法性を確認する
		const candidateProblems =
			validator.validateTeam(candidateParty);

		if (candidateProblems) {
			console.error(candidateProblems);
			throw new Error(
				`Generation ${generation}: Candidate Party failed Showdown validation`
			);
		}

		// どのポケモンが変わったか表示する
		printMutation(currentParty, candidateParty);

		// CurrentとCandidateを実際に戦わせる
		const result = await evaluateParties(
			currentParty,
			candidateParty,
			evaluationConfig,
		);

		console.log(
			`Result: Current ${result.currentWins} - ` +
			`Candidate ${result.candidateWins} - ` +
			`Draw ${result.draws}`
		);

		/*
		 * Candidateの勝利数がCurrentより多ければ採用する。
		 *
		 * 同点の場合はCurrentを維持する。
		 * Ver.1では最も単純なHill Climbing
		 * （山登り法：現在より良い候補だけを採用する探索）
		 * とする。
		 */
		if (result.candidateWins > result.currentWins) {
			console.log('Decision: Candidate accepted.');

			// Candidateを次世代のCurrentにする
			currentParty = candidateParty;
		} else {
			console.log('Decision: Candidate rejected.');
		}

		console.log('');
	}

	console.log('=== Search Completed ===');
	console.log('');

	// 探索終了時点で残ったパーティを最終結果として表示する
	printParty('Final Party:', currentParty);

	console.log('Milestone 11 completed.');
	console.log('Ver.1 automatic search loop completed.');
}

main().catch(error => {
	console.error(error);
	process.exit(1);
});