import { Runner } from '../sim/tools/runner';

/**
 * パーティ同士を戦わせた結果。
 */
export interface EvaluationResult {
	currentWins: number;
	candidateWins: number;
	draws: number;
	elapsedSeconds: number;
}

/**
 * Current PartyとCandidate Partyを指定回数戦わせて評価する。
 *
 * Bot 1 = Current Party
 * Bot 2 = Candidate Party
 *
 * 現段階では単純に勝利数を評価値として使用する。
 */
export async function evaluateParties(
	currentParty: PokemonSet[],
	candidateParty: PokemonSet[],
	numberOfGames: number,
	showProgress = false,
): Promise<EvaluationResult> {
	let currentWins = 0;
	let candidateWins = 0;
	let draws = 0;

	const startTime = Date.now();

	for (let i = 1; i <= numberOfGames; i++) {
		let winner = '';

		// Showdown Runnerで1試合を実行する
		const runner = new Runner({
			format: 'gen2nc2000',

			// Bot 1には現在の基準パーティを渡す
			p1options: {
				team: currentParty,
			},

			// Bot 2には変異後の候補パーティを渡す
			p2options: {
				team: candidateParty,
			},

			output: false,
			error: true,

			// バトルログから勝者を取得する
			onChunk: chunk => {
				for (const line of chunk.split('\n')) {
					if (line.startsWith('|win|')) {
						winner = line.slice('|win|'.length);
					} else if (line === '|tie|') {
						winner = 'tie';
					}
				}
			},
		});

		await runner.run();

		// 勝敗を集計する
		if (winner === 'Bot 1') {
			currentWins++;
		} else if (winner === 'Bot 2') {
			candidateWins++;
		} else {
			draws++;
		}

		// 必要な場合だけ途中経過を表示する
		if (
			showProgress &&
			(i % 10 === 0 || i === numberOfGames)
		) {
			console.log(`${i}/${numberOfGames} battles completed`);
		}
	}

	const elapsedSeconds = (Date.now() - startTime) / 1000;

	// 試合数と集計数が一致していることを確認する
	const totalResults =
		currentWins +
		candidateWins +
		draws;

	if (totalResults !== numberOfGames) {
		throw new Error(
			`Result count mismatch: expected ${numberOfGames}, got ${totalResults}`
		);
	}

	return {
		currentWins,
		candidateWins,
		draws,
		elapsedSeconds,
	};
}