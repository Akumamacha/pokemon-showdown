import {strict as assert} from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {describe, it} from 'node:test';
import {runObservation} from '../wp01b-observation';

describe('WP01B observation artifact', () => {
 it('保存・公開表示・日本語記録が同じログから作られる', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wp01b-'));
  const o=await runObservation('1,wp01b-test-1',dir,1);
  assert.equal(o.schema,'ver3-wp01b-observation-v1');
  assert.ok(o.rawLog.length>0); assert.ok(o.visibleLog.length>0);
  assert.ok(!o.visibleLog.includes('|poke|')); assert.ok(!o.visibleLog.includes('|request|'));
  assert.equal(o.inputLog,null); assert.ok(o.japaneseTurns.length>0);
  assert.ok(fs.existsSync(path.join(dir,`${o.matchId}.json`))); assert.ok(fs.existsSync(path.join(dir,`${o.matchId}.html`)));
 });
});
