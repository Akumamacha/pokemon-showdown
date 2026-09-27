import * as fs from 'fs';
import * as path from 'path';
import {Runner} from '../sim/tools/runner';
import {PRNG} from '../sim/prng';
import {buildRandomParty} from './party-builder';
import {createPlayerOptions} from './experiment-config';

export interface Observation {schema: string; matchId: string; seed: string; format: string; seat: string; playerAI: string; selectionAI: string; party: string[]; opponentParty: string[]; outcome: string|null; rawLog: string; visibleLog: string; japaneseTurns: string[]; inputLog: null; inputLogNote: string; createdAt: string;}

function visible(lines: string[]) { return lines.filter(l => /^\|(gametype|gen|tier|turn|switch|move|[-](damage|status|curestatus)|faint|win|tie)\|/.test(l)); }
function japanese(lines: string[]) { return lines.map(l => { const p=l.split('|'); if (p[1]==='turn') return `ターン ${p[2]}`; if(p[1]==='switch') return `交代: ${p[2]}`; if(p[1]==='move') return `技: ${p[2]} → ${p[3]}`; if(p[1]==='faint') return `ひんし: ${p[2]}`; if(p[1]==='win') return `勝者: ${p[2]}`; if(p[1]==='tie') return '引き分け'; return `[原文] ${l}`; }); }
function html(o: Observation) { const data=JSON.stringify({matchId:o.matchId,turns:o.japaneseTurns}); return `<!doctype html><meta charset="utf-8"><title>${o.matchId}</title><style>body{font-family:system-ui;margin:2em}#log{white-space:pre-wrap;border:1px solid #aaa;padding:1em;min-height:12em}button{margin:.3em}</style><h1>対戦観察 ${o.matchId}</h1><p>形式: ${o.format} / 結果: ${o.outcome??'記録中'} / 公開イベントのみ</p><button id="prev">前のターン</button><button id="next">次のターン</button><div id="log"></div><script>const d=${data};let i=0;function show(){document.querySelector('#log').textContent=d.turns.slice(0,i+1).join('\\n');}prev.onclick=()=>{i=Math.max(0,i-1);show()};next.onclick=()=>{i=Math.min(d.turns.length-1,i+1);show()};show();</script>`; }

export async function runObservation(seed: string, outDir: string, index: number): Promise<Observation> {
 const party=buildRandomParty(new PRNG(seed)); const opponent=buildRandomParty(new PRNG(seed.replace(',', ',opponent-')));
 const chunks:string[]=[]; let outcome:string|null=null; const matchId=`wp01b-${Date.now()}-${index}`;
 const p1=createPlayerOptions('simple',party,'first-legal'); const p2=createPlayerOptions('random',opponent,'first-legal');
 await new Runner({format:'gen2nc2000',prng:seed,p1options:p1,p2options:p2,onChunk:c=>chunks.push(c)}).run();
 const raw=chunks.join(''); const lines=raw.split(/\r?\n/).filter(Boolean); const vis=visible(lines); const win=lines.find(l=>l.startsWith('|win|')); outcome=win?win.split('|')[2]??null:null;
 const o:Observation={schema:'ver3-wp01b-observation-v1',matchId,seed,format:'gen2nc2000',seat:'p1=simple; p2=random',playerAI:'SimplePlayerAI vs RandomPlayerAI',selectionAI:'first-legal (公開Partyの合法性のみ)',party:party.map(x=>`${x.species} Lv${x.level}`),opponentParty:opponent.map(x=>`${x.species} Lv${x.level}`),outcome,rawLog:raw,visibleLog:vis.join('\n'),japaneseTurns:japanese(vis),inputLog:null,inputLogNote:'現行Runnerの公開APIではinputLogを取得できないためnull。推測・再生成はしない。',createdAt:new Date().toISOString()};
 fs.mkdirSync(outDir,{recursive:true}); fs.writeFileSync(path.join(outDir,`${matchId}.json`),JSON.stringify(o,null,2)); fs.writeFileSync(path.join(outDir,`${matchId}.html`),html(o)); return o;
}

export async function main(outDir='ai-project/observations/wp01b', games=3) { const all:Observation[]=[]; for(let i=0;i<games;i++) all.push(await runObservation(`1,wp01b-fixed-${i+1}`,outDir,i+1)); fs.writeFileSync(path.join(outDir,'index.json'),JSON.stringify(all.map(x=>({matchId:x.matchId,outcome:x.outcome})),null,2)); return all; }
if (require.main===module) { const games=Number(process.argv[2]??3); void main(process.argv[3]??'ai-project/observations/wp01b',games).then(xs=>console.log(`WP01B observations: ${xs.length}`)); }
