import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Runner } from '../../sim/tools/runner';
import { Battle } from '../../sim/battle';
import { Dex } from '../../sim/dex';
import { createPlayerOptions } from '../experiment-config';
import { enumerateSelections, inspectSelection, type SelectedTeam } from '../team-selection';
import { pokemonPool } from '../party-builder';
import { pokemonName } from '../pokemon-display';
import { runExperiment } from '../experiment';
import { deriveSeed } from '../experiment-rng';

const party = () => structuredClone(pokemonPool.slice(0, 6));

void test('NC2000の20組を重複なく列挙し、Lv合計境界と登録の違反を区別する', () => {
	const input = party();
	const before = structuredClone(input);
	let result = enumerateSelections(input);
	assert.deepEqual(input, before);
	assert.equal(result.legal.length, 20);
	assert.equal(new Set(result.legal.map(c => c.slots.join(','))).size, 20);
	assert.equal(result.legal.filter(c => c.slots.includes(1)).length, 10);
	// 55+51+50=156を除外、55+50+50=155は合法。登録6匹自体は合法。
	input[1].level = 51;
	result = enumerateSelections(input);
	assert.deepEqual(result.partyProblems, []);
	assert.equal(result.legal.length, 16);
	assert.equal(result.rejected.length, 4);
	assert.ok(result.rejected.every(c => c.totalLevel === 156 && c.problems[0].includes('155')));
	input[1].level = 55;
	assert.equal(enumerateSelections(input).rejected.length, 4);
	for (const level of [49, 56]) {
		const invalid = party(); invalid[0].level = level;
		assert.ok(enumerateSelections(invalid).partyProblems.length);
	}
	const duplicate = party(); duplicate[1] = structuredClone(duplicate[0]);
	assert.ok(enumerateSelections(duplicate).partyProblems.some(p => /Species Clause|same Pokémon/.test(p)));
	const item = party(); item[1].item = item[0].item;
	assert.ok(enumerateSelections(item).partyProblems.length);
	assert.ok(enumerateSelections(input.slice(0, 3)).partyProblems.length);
	for (const slots of [[1, 1, 2], [0, 2, 3], [1, 2], [1, 2, 3, 4], [1.5, 2, 3]]) {
		assert.ok(inspectSelection(party(), slots).length);
	}
});

void test('選出順は組合せと別で、先発を変える。defaultは低レベル優先', () => {
	for (const order of [[1, 2, 3], [3, 2, 1]]) {
		assert.deepEqual(inspectSelection(party(), order), []);
		const battle = new Battle({
			formatid: Dex.formats.get('gen2nc2000').id, seed: '1,2,3,4',
			p1: { name: 'Bot 1', team: party() }, p2: { name: 'Bot 2', team: party() },
		});
		try {
			battle.makeChoices(`team ${order.join(',')}`, 'default');
			assert.equal(battle.p1.active[0].species.name, party()[order[0] - 1].species);
			assert.deepEqual(battle.p2.pokemon.map(p => p.species.name), ['Zapdos', 'Cloyster', 'Exeggutor']);
		} finally { battle.destroy(); }
	}
});

void test('全20合法候補を実Runnerで受理・完走し、カビゴンLv55も実際に選出される', async () => {
	for (const candidate of enumerateSelections(party()).legal) {
		let selected: SelectedTeam | undefined;
		const options = createPlayerOptions('random', party(), 'legacy', value => { selected = value; });
		const create = options.createAI;
		options.createAI = (stream, aiOptions) => {
			const ai = create(stream, aiOptions);
			const receive = ai.receiveRequest.bind(ai);
			// 候補を直接コマンドへ渡す検査。観測用wrapperにはpreview要求も渡す。
			const choose = ai.choose.bind(ai);
			ai.choose = choice => choose(choice === 'default' ? `team ${candidate.slots.join(',')}` : choice);
			ai.receiveRequest = receive;
			return ai;
		};
		let terminal = false;
		await new Runner({
			format: 'gen2nc2000', prng: deriveSeed('wp02-candidates', ...candidate.slots),
			p1options: options, p2options: createPlayerOptions('random', party()),
			onChunk: chunk => { if (/\|win\||\|tie\|/.test(chunk)) terminal = true; },
		}).run();
		assert.ok(terminal);
		assert.deepEqual(selected?.slots, candidate.slots);
		assert.deepEqual(selected?.species, candidate.slots.map(slot => party()[slot - 1].species));
	}
});

void test('既存日本語データは11種を正しく表示し、未知名はそのまま返す', () => {
	assert.deepEqual(pokemonPool.map(p => pokemonName(p.species)), [
		'カビゴン', 'サンダー', 'パルシェン', 'ナッシー', 'ガラガラ', 'スターミー',
		'ライコウ', 'スイクン', 'カイリキー', 'ゲンガー', 'エアームド',
	]);
	assert.equal(pokemonName('Unknown Pokemon'), 'Unknown Pokemon');
	assert.equal(pokemonName('constructor'), 'constructor');
});

void test('操作AIと選出方式は独立し、legacyの互換性とdefault比較を維持する', async () => {
	for (const [mode, expected] of [
		['legacy', [2, 5, 6]], ['default', [2, 3, 4]], ['first-legal', [1, 2, 3]],
	] as const) {
		let selected: SelectedTeam | undefined;
		await new Runner({
			format: 'gen2nc2000', prng: deriveSeed('selection-modes'),
			p1options: createPlayerOptions('simple', party(), mode, value => { selected = value; }),
			p2options: createPlayerOptions('random', party()),
		}).run();
		assert.deepEqual(selected?.slots, expected);
	}
	assert.throws(() => Reflect.apply(createPlayerOptions, undefined, ['random', party(), 'typo']), /Selection mode/);
});

void test('新選出の探索を2回再現し、選出記録と日本語表示を内部英語名から分離する', async t => {
	const output: string[] = [];
	t.mock.method(console, 'log', (line: string) => { output.push(line); });
	const config = {
		format: 'gen2nc2000', currentAI: 'random', candidateAI: 'random',
		experimentSeed: 'wp02', games: 3, generations: 2,
		currentSelection: 'first-legal', candidateSelection: 'first-legal',
	} as const;
	mkdirSync('ai-project/experiments', { recursive: true });
	const a = await runExperiment(config, mkdtempSync('ai-project/experiments/wp02-'));
	const b = await runExperiment(config, mkdtempSync('ai-project/experiments/wp02-'));
	const { id: idA, startedAt: startA, finishedAt: endA, ...restA } = a.record;
	const { id: idB, startedAt: startB, finishedAt: endB, ...restB } = b.record;
	assert.deepEqual(restA, restB);
	assert.equal(a.record.schemaVersion, 2);
	assert.deepEqual(JSON.parse(readFileSync(a.file, 'utf8')), a.record);
	for (const generation of a.record.generations) {
		for (const battle of generation.battles) {
			for (const side of ['current', 'candidate'] as const) {
				const selected = battle.selections?.[side];
				assert.ok(selected);
				assert.deepEqual(selected.slots, [1, 2, 3]);
				assert.ok(selected.species.every(name => pokemonPool.some(p => p.species === name)));
			}
		}
	}
	assert.match(output.join('\n'), /初期パーティ:|最終パーティ:/);
	assert.match(output.join('\n'), /選出（先頭が先発）:/);
	for (const pokemon of pokemonPool) assert.ok(!output.join('\n').includes(pokemon.species));
});
