import { readFileSync } from 'node:fs';
import { runFinalEvaluation, type FinalEvaluationPlan } from './final-evaluation';
async function main() {
	const planFile = process.argv[2] ?? 'ai-project/final-evaluation-plan.json';
	if (process.argv.length > 3) throw new Error('使用方法: node dist/ai-project/milestone14.js [計画JSON]');
	await runFinalEvaluation(JSON.parse(readFileSync(planFile, 'utf8')) as FinalEvaluationPlan);
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
