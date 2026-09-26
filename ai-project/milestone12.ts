import { runBenchmark } from './benchmark';
import { pokemonPool } from './party-builder';
import { type PlayerAIKind } from './experiment-config';
import { type SelectionMode } from './team-selection';

async function main() {
	const [seed, games = '10', target = 'first6', ai = 'random', selection = 'first-legal', ...extra] = process.argv.slice(2);
	if (!seed || extra.length) throw new Error('使用方法: node dist/ai-project/milestone12.js <Seed> [試合数] [first6|last6] [random|simple] [first-legal|simple-counter]');
	const targetParty = target === 'first6' ? pokemonPool.slice(0, 6) : target === 'last6' ? pokemonPool.slice(5, 11) : (() => { throw new Error('targetはfirst6またはlast6'); })();
	await runBenchmark({ format: 'gen2nc2000', experimentSeed: seed, games: Number(games), targetParty,
		targetAI: ai as PlayerAIKind, targetSelection: selection as SelectionMode,
		baselineAI: 'random', baselineSelection: 'first-legal' });
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
