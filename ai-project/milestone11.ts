import { runExperiment } from './experiment';

// 実験Seedを必須にし、実行条件を後からJSONで確認できるようにする。
// 引数: Experiment Seed、世代数（既定10）、1世代の試合数（既定100）。
async function main() {
	const [experimentSeed, generations = '10', games = '100', ...extra] = process.argv.slice(2);
	if (!experimentSeed || extra.length) {
		throw new Error('使用方法: node dist/ai-project/milestone11.js <Experiment Seed> [世代数] [試合数]');
	}
	await runExperiment({
		format: 'gen2nc2000', experimentSeed, generations: Number(generations), games: Number(games),
		currentAI: 'random', candidateAI: 'random',
	});
}

void main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
