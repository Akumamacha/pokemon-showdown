import { strict as assert } from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ObjectReadWriteStream } from '../../lib/streams';
import { Battle } from '../../sim/battle';
import { Dex } from '../../sim/dex';
import { PRNG } from '../../sim/prng';
import { type ChoiceRequest } from '../../sim/side';
import { Runner } from '../../sim/tools/runner';
import { createPlayerOptions, PLAYER_AI } from '../experiment-config';
import { runExperiment } from '../experiment';
import { deriveSeed } from '../experiment-rng';
import { pokemonPool } from '../party-builder';

const party = () => structuredClone(pokemonPool.slice(0, 6));

function startedBattle() {
	const battle = new Battle({
		formatid: Dex.formats.get('gen2nc2000').id, seed: '1,2,3,4',
		p1: { name: 'Bot 1', team: party() }, p2: { name: 'Bot 2', team: party() },
	});
	battle.makeChoices('team 123', 'team 123');
	return battle;
}

/** requestは手書きせず実Battleから取得し、返答もSide.chooseで受理を検査する。 */
function answer(battle: Battle, seed = 1) {
	const choices: string[] = [];
	const stream = new ObjectReadWriteStream<string>({ write: choice => { choices.push(choice); } });
	const options = createPlayerOptions('simple', party(), 'first-legal');
	const ai = options.createAI(stream, { ...options, seed: deriveSeed('wp03-action', seed) });
	assert.ok(battle.p1.activeRequest);
	ai.receiveRequest(battle.p1.activeRequest);
	assert.equal(choices.length, 1);
	assert.ok(battle.p1.choose(choices[0]), battle.p1.choice.error);
	return choices[0];
}

void test('Simple: 実requestの先頭合法技、disabled、PP切れ、Struggle、交代不能に対応', () => {
	const battle = startedBattle();
	try {
		const active = battle.p1.active[0];
		// 状態を限定したfixture。trappedのゲーム内発生条件は再実装しない。
		active.trapped = true;
		battle.makeRequest('move');
		assert.equal(answer(battle), 'move 1');
		active.disableMove(active.moveSlots[0].id);
		battle.makeRequest('move');
		assert.equal(answer(battle), 'move 2');
		for (const move of active.moveSlots) move.pp = 0;
		active.moveSlots[3].pp = 1;
		battle.makeRequest('move');
		assert.equal(answer(battle), 'move 4');
		active.moveSlots[3].pp = 0;
		battle.makeRequest('move');
		const request = battle.p1.activeRequest;
		assert.ok(request && 'active' in request);
		assert.equal(request.active[0].moves[0].id, 'struggle');
		assert.equal(answer(battle), 'move 1');
		assert.equal(battle.p1.choice.actions[0].choice, 'move');
		assert.equal(battle.p1.choice.actions[0].moveid, 'struggle');
	} finally { battle.destroy(); }
});

void test('Simple: 通常交代・強制交代で瀕死と場のポケモンを避け、唯一の控えを選ぶ', () => {
	const battle = startedBattle();
	try {
		battle.p1.pokemon[1].faint();
		battle.faintMessages();
		const observed = new Set<string>();
		for (let seed = 1; seed <= 30; seed++) {
			battle.makeRequest('move');
			observed.add(answer(battle, seed));
		}
		assert.deepEqual([...observed].sort(), ['move 1', 'switch 3']);
		battle.p1.active[0].faint();
		battle.faintMessages();
		battle.p1.active[0].switchFlag = true;
		battle.makeRequest('switch');
		assert.equal(answer(battle), 'switch 3');
		assert.ok(battle.p2.activeRequest?.wait);
		const choices: string[] = [];
		const options = createPlayerOptions('simple', party());
		const ai = options.createAI(new ObjectReadWriteStream<string>({ write: c => { choices.push(c); } }),
			{ ...options, seed: '1,2,3,4' });
		ai.receiveRequest(battle.p2.activeRequest);
		assert.deepEqual(choices, []);
		assert.doesNotThrow(() => ai.receiveError(new Error('[Unavailable choice] fixture')));
		assert.throws(() => ai.receiveError(new Error('Unexpected failure')), /Unexpected failure/);
	} finally { battle.destroy(); }
});

void test('探索→Evaluator→実Runnerの両席で指定AIの生成と実行動を確認し、探索全体を2回再現', async t => {
	t.mock.method(console, 'log', () => {});
	t.mock.method(Math, 'random', () => { throw new Error('Unmanaged random'); });
	t.mock.method(PRNG, 'generateSeed', () => { throw new Error('Unmanaged seed'); });
	t.mock.method(Runner.AI_OPTIONS, 'createAI', () => { throw new Error('Implicit AI fallback'); });
	mkdirSync('ai-project/experiments', { recursive: true });
	for (const [currentAI, candidateAI] of [['simple', 'random'], ['random', 'simple'], ['simple', 'simple']] as const) {
		const run = async () => {
			const actions: { side: string, kind: string, choice: string, expected?: string }[] = [];
			const chunks: string[] = [];
			const result = await runExperiment({
				format: 'gen2nc2000', experimentSeed: 'wp03-connection', generations: 2, games: 3,
				currentAI, candidateAI, currentSelection: 'first-legal', candidateSelection: 'first-legal',
			}, mkdtempSync('ai-project/experiments/wp03-test-'), async options => {
				for (const [side, aiOptions] of [['p1', options.p1options], ['p2', options.p2options]] as const) {
					assert.ok(aiOptions);
					const create = aiOptions.createAI;
					aiOptions.createAI = (stream, settings) => {
						const ai = create(stream, settings);
						const receive = ai.receiveRequest.bind(ai);
						const choose = ai.choose.bind(ai);
						let request: ChoiceRequest;
						ai.receiveRequest = value => { request = value; receive(value); };
						ai.choose = choice => {
							const index = request && 'active' in request ?
								request.active[0].moves.findIndex(m => !m.disabled) : -1;
							actions.push({ side, kind: ai.constructor.name, choice,
								expected: index >= 0 ? `move ${index + 1}` : undefined });
							choose(choice);
						};
						return ai;
					};
				}
				const onChunk = options.onChunk;
				await new Runner({ ...options, onChunk: chunk => { chunks.push(chunk); onChunk?.(chunk); } }).run();
			});
			const { id, startedAt, finishedAt, ...record } = result.record;
			assert.deepEqual(JSON.parse(readFileSync(result.file, 'utf8')), result.record);
			return { record, actions, log: chunks.join('\n').split('\n').filter(l => !l.startsWith('|t:|')).join('\n') };
		};
		const first = await run();
		assert.deepEqual(first, await run());
		assert.equal(first.record.playerBehavior?.current, PLAYER_AI[currentAI].behavior);
		assert.equal(first.record.playerBehavior?.candidate, PLAYER_AI[candidateAI].behavior);
		for (const [side, kind] of [['p1', currentAI], ['p2', candidateAI]] as const) {
			const actions = first.actions.filter(a => a.side === side);
			assert.ok(actions.length > 6);
			assert.ok(actions.every(a => a.kind === PLAYER_AI[kind].name));
			const moves = actions.filter(a => a.choice.startsWith('move '));
			assert.ok(moves.length);
			if (kind === 'simple') assert.ok(moves.every(a => a.choice === a.expected));
		}
		for (const generation of first.record.generations) {
			assert.equal(generation.result.unknown + generation.result.errors, 0);
			for (const battle of generation.battles) {
				assert.deepEqual(battle.selections?.current?.slots, [1, 2, 3]);
				assert.deepEqual(battle.selections?.candidate?.slots, [1, 2, 3]);
			}
		}
	}
});

void test('CLIで両AIを明示でき、未知AIは実験開始前に拒否する', () => {
	const output = execFileSync(process.execPath,
		['dist/ai-project/milestone11.js', 'wp03-cli', '1', '1', 'first-legal', 'simple', 'random'],
		{ encoding: 'utf8', timeout: 30000, windowsHide: true });
	const file = (/実験記録: (.+)/.exec(output))?.[1].trim();
	assert.ok(file);
	const record = JSON.parse(readFileSync(file, 'utf8'));
	assert.equal(record.experiment.currentAI, 'simple');
	assert.equal(record.experiment.candidateAI, 'random');
	assert.equal(record.status, 'completed');
	for (const args of [['typo', 'simple'], ['random', 'constructor']]) {
		const invalid = spawnSync(process.execPath,
			['dist/ai-project/milestone11.js', 'wp03-cli', '1', '1', 'first-legal', ...args],
			{ encoding: 'utf8', timeout: 30000, windowsHide: true });
		assert.equal(invalid.status, 1);
		assert.match(invalid.stderr, /Player AI/);
		assert.ok(!invalid.stdout.includes('実験記録:'));
	}
});
