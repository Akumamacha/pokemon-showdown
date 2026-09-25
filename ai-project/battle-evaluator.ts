import { Runner, type RunnerOptions } from '../sim/tools/runner';
import { createPlayerOptions, printEvaluationConfig, type EvaluationConfig } from './experiment-config';

export type BattleOutcome = 'current' | 'candidate' | 'draw' | 'unknown';

export type RunBattle = (options: RunnerOptions) => Promise<void>;

async function runShowdownBattle(options: RunnerOptions): Promise<void> {
	await new Runner(options).run();
}

/** 明示的な終局ログだけを勝敗と認める。不明な結果は引き分けではない。 */
export function parseBattleOutcome(line: string): BattleOutcome {
	if (line === '|win|Bot 1') return 'current';
	if (line === '|win|Bot 2') return 'candidate';
	if (line === '|tie|') return 'draw';
	return 'unknown';
}

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
	config: EvaluationConfig,
	showProgress = false,
	// 終局ログの欠落・異常も再現して検査できるよう、対戦実行だけを差し替え可能にする。
	runBattle: RunBattle = runShowdownBattle,
): Promise<EvaluationResult> {
	// 非同期評価の途中で呼び出し元が設定を変更しても、この評価の条件は変わらない。
	const settings = { ...config };
	printEvaluationConfig(settings);
	const numberOfGames = settings.games;
	let currentWins = 0;
	let candidateWins = 0;
	let draws = 0;

	const startTime = Date.now();

	for (let i = 1; i <= numberOfGames; i++) {
		let terminalLine = '';

		// Showdown Runnerで1試合を実行する
		const options: RunnerOptions = {
			format: settings.format,

			// Bot 1には現在の基準パーティを渡す
			p1options: createPlayerOptions(settings.currentAI, currentParty),

			// Bot 2には変異後の候補パーティを渡す
			p2options: createPlayerOptions(settings.candidateAI, candidateParty),

			output: false,
			error: true,

			// バトルログから勝者を取得する
			onChunk: chunk => {
				for (const line of chunk.split('\n')) {
					if (line.startsWith('|win|') || line === '|tie|') {
						const next = parseBattleOutcome(line);
						if (next === 'unknown' || (terminalLine && parseBattleOutcome(terminalLine) !== next)) {
							throw new Error(`Invalid battle result: ${line}`);
						}
						terminalLine = line;
					}
				}
			},
		};

		try {
			await runBattle(options);
		} catch (error) {
			throw new Error(`Battle ${i}/${numberOfGames} failed: ${String(error)}`);
		}

		// 勝敗を集計する
		switch (parseBattleOutcome(terminalLine)) {
		case 'current':
			currentWins++;
			break;
		case 'candidate':
			candidateWins++;
			break;
		case 'draw':
			draws++;
			break;
		case 'unknown':
			// 結果が欠落した評価で探索を更新しないよう、ここで停止する。
			throw new Error(`Battle ${i}/${numberOfGames}: Unknown result (missing win/tie log)`);
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
