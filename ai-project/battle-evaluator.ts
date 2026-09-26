import { Runner, type RunnerOptions } from '../sim/tools/runner';
import { type PRNGSeed } from '../sim/prng';
import { createPlayerOptions, printEvaluationConfig, type EvaluationConfig } from './experiment-config';
import { type SelectedTeam } from './team-selection';

export type BattleOutcome = 'current' | 'candidate' | 'draw' | 'unknown';

export type RunBattle = (options: RunnerOptions) => Promise<void>;

export interface BattleRecord {
	game: number;
	runnerSeed: PRNGSeed;
	outcome: BattleOutcome | 'error';
	error?: string;
	selections?: { current?: SelectedTeam, candidate?: SelectedTeam };
}

export interface EvaluationTrace {
	seeds: readonly PRNGSeed[];
	// 各試合直後に保存する。失敗した試合もDrawに混ぜず記録する。
	onBattle: (record: BattleRecord) => void;
}

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
	trace?: EvaluationTrace,
): Promise<EvaluationResult> {
	// 非同期評価の途中で呼び出し元が設定を変更しても、この評価の条件は変わらない。
	const settings = { ...config };
	printEvaluationConfig(settings);
	const numberOfGames = settings.games;
	const seeds = trace ? [...trace.seeds] : undefined;
	if (seeds && seeds.length !== numberOfGames) throw new Error('Battle seed count mismatch');
	// JavaScriptから穴あき配列を渡しても、暗黙のseed生成へフォールバックしない。
	if (seeds?.some(seed => typeof seed !== 'string' || !seed)) {
		throw new Error('Missing Battle seed');
	}
	let currentWins = 0;
	let candidateWins = 0;
	let draws = 0;

	const startTime = Date.now();
	// 同じPartyの合法候補列挙は評価ごとに一度だけ行う。
	let selections: NonNullable<BattleRecord['selections']> = {};
	const currentOptions = createPlayerOptions(settings.currentAI, currentParty, settings.currentSelection,
		selected => { selections.current = selected; });
	const candidateOptions = createPlayerOptions(settings.candidateAI, candidateParty, settings.candidateSelection,
		selected => { selections.candidate = selected; });

	for (let i = 1; i <= numberOfGames; i++) {
		let terminalLine = '';
		selections = {};

		// Showdown Runnerで1試合を実行する
		const options: RunnerOptions = {
			format: settings.format,
			// RunnerはこのseedからBattle本体と両AIのseedを決定的に生成する。
			prng: seeds?.[i - 1],

			// Bot 1には現在の基準パーティを渡す
			p1options: { ...currentOptions, team: structuredClone(currentOptions.team) },

			// Bot 2には変異後の候補パーティを渡す
			p2options: { ...candidateOptions, team: structuredClone(candidateOptions.team) },

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
			if (trace && seeds) trace.onBattle({
				game: i, runnerSeed: seeds[i - 1], outcome: 'error', error: String(error), selections,
			});
			throw new Error(`Battle ${i}/${numberOfGames} failed: ${String(error)}`);
		}

		const outcome = parseBattleOutcome(terminalLine);
		if (trace && seeds) trace.onBattle({
			game: i, runnerSeed: seeds[i - 1], outcome, selections,
			...(outcome === 'unknown' ? { error: 'Unknown result (missing win/tie log)' } : {}),
		});

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
			console.log(`${i}/${numberOfGames} 試合完了`);
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
