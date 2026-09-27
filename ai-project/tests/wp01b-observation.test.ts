import {strict as assert} from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {describe, it} from 'node:test';
import {regenerateHtml, runObservation} from '../wp01b-observation';

describe('WP01B observation artifact', () => {
 it('保存・公開表示・日本語記録が同じログから作られる', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wp01b-'));
  const o=await runObservation('1,wp01b-test-1',dir,1);
  assert.equal(o.schema,'ver3-wp01b-observation-v1');
  assert.ok(o.rawLog.length>0); assert.ok(o.visibleLog.length>0);
  assert.ok(!o.visibleLog.includes('|poke|')); assert.ok(!o.visibleLog.includes('|request|'));
  assert.equal(o.inputLog,null); assert.ok(o.japaneseTurns.length>0);
  assert.ok(fs.existsSync(path.join(dir,`${o.matchId}.json`))); assert.ok(fs.existsSync(path.join(dir,`${o.matchId}.html`)));
  regenerateHtml(dir);
  const page=fs.readFileSync(path.join(dir,`${o.matchId}.html`),'utf8');
  assert.match(page,/全ターンを一括表示/); assert.match(page,/ターン別表示に戻す/);
  assert.match(page,/カビゴン \(Snorlax\)|サンダー \(Zapdos\)|ゲンガー \(Gengar\)/);
  assert.match(page,/10まんボルト \(Thunderbolt\)|じしん \(Earthquake\)|なみのり \(Surf\)/);
  assert.ok(!page.includes('|request|')); assert.ok(!page.includes('|poke|'));
  const fixture={...o,matchId:'fixture',visibleLog:'|turn|1|\n|switch|p1a: Snorlax|Snorlax, L55|\n|move|p1a: Snorlax|Body Slam|p2a: Gengar|\n|move|p1a: Snorlax|Sleep Talk|p2a: Gengar|',japaneseTurns:[]};
  fs.writeFileSync(path.join(dir,'fixture.json'),JSON.stringify(fixture)); regenerateHtml(dir);
  const fixturePage=fs.readFileSync(path.join(dir,'fixture.html'),'utf8');
  assert.match(fixturePage,/カビゴン \(Snorlax\)/); assert.match(fixturePage,/のしかかり \(Body Slam\)/); assert.match(fixturePage,/ねごと \(Sleep Talk\)/);
 });
});
