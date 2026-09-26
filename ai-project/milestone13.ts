import { runIntegratedExperiment } from './integrated-experiment';
import { type PlayerAIKind } from './experiment-config';
import { type SelectionMode } from './team-selection';

async function main() {
	const [seed, generations = '1', games = '1', selection = 'simple-counter', currentAI = 'simple', candidateAI = currentAI, ...extra] = process.argv.slice(2);
	if (!seed || extra.length) throw new Error('使用方法: node dist/ai-project/milestone13.js <Seed> [世代数] [試合数] [Selection] [Current AI] [Candidate AI]');
	await runIntegratedExperiment({
		format: 'gen2nc2000', experimentSeed: seed, generations: Number(generations), games: Number(games),
		currentAI: currentAI as PlayerAIKind, candidateAI: candidateAI as PlayerAIKind,
		currentSelection: selection as SelectionMode, candidateSelection: selection as SelectionMode,
	});
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
