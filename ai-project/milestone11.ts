import { runExperiment } from './experiment';
import { type SelectionMode } from './team-selection';
import { type PlayerAIKind } from './experiment-config';

// 実験Seedを必須にし、実行条件を後からJSONで確認できるようにする。
// 引数: Experiment Seed、世代数（既定10）、1世代の試合数（既定100）。
async function main() {
	const [experimentSeed, generations = '10', games = '100', selection = 'first-legal',
		currentAI = 'random', candidateAI = 'random', ...extra] = process.argv.slice(2);
	if (!experimentSeed || extra.length) {
		throw new Error('使用方法: node dist/ai-project/milestone11.js <Experiment Seed> [世代数] [試合数] [first-legal|default|legacy] [Current AI: random|simple] [Candidate AI: random|simple]');
	}
	await runExperiment({
		format: 'gen2nc2000', experimentSeed, generations: Number(generations), games: Number(games),
		// 省略時はWP01/WP02のrandomを維持。不明な値は共通の設定検証で拒否する。
		currentAI: currentAI as PlayerAIKind, candidateAI: candidateAI as PlayerAIKind,
		currentSelection: selection as SelectionMode, candidateSelection: selection as SelectionMode,
	});
}

void main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
