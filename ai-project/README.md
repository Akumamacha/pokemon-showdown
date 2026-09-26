# Pokémon GSC AI Project — Ver.2 WP04

## 実行・確認方法

リポジトリのルートで実行する。

```sh
npm run build
npm run typecheck:ai
npm run test:ai
```

- `build`：通常のShowdown build。`dist/`へ実行用JavaScriptを出力する。
- `typecheck:ai`：専用の`ai-project/tsconfig.json`で旧milestoneを含むAI Projectとテストを検査する。
  親のstrict設定を引き継ぎ、`noEmit: true`と`incremental: false`によりJavaScriptや型検査キャッシュを出力しない。
  Showdownの依存先に必要な既存のグローバル型宣言も読み込む。ルートの型検査設定は変更しない。
- `test:ai`：通常build後にM1・WP01・WP02・WP03・WP04のテストを実行する。
  146通りの合法Party、共有参照、AI指定、Unknownの扱いを維持する。
  実Runnerの対戦ログ一致と、3世代×4試合の探索2回の全経路一致も検査する。
  build済みなら`node --test dist/ai-project/tests/*.test.js`でも実行できる。

探索にはExperiment Seed（空でない文字列）を必ず指定する：

```sh
node dist/ai-project/milestone11.js wp02 3 10 first-legal
node dist/ai-project/milestone11.js wp02 3 10 default
node dist/ai-project/milestone11.js wp03 3 10 first-legal simple simple
node dist/ai-project/milestone11.js wp03 3 10 first-legal random simple
node dist/ai-project/milestone11.js wp04 3 10 simple-counter random simple
```

引数はseed、世代数、1世代の試合数、選出方式、Current AI、Candidate AI。
世代数と試合数の省略時は10×100。両AIはそれぞれ `random` / `simple`、省略時は従来の `random`。
不明なAI名は実験開始前に拒否する。APIでは従来どおり両側のAI指定が必須。
CLIの選出方式省略時は `first-legal`。WP01のCLI条件には末尾に `legacy` を追加する。
小規模確認には `node dist/ai-project/milestone11.js sample 3 4` を使える。

## 合法な6→3選出と比較

NC2000の実装は `config/formats.ts`、`data/rulesets.ts`、`sim/side.ts` を参照する。
登録はShowdownで3〜6匹だが、本プロジェクトの列挙APIは6匹を必須とする。
選出3匹、Lv50〜55、選出合計Lv155以下。Species Clause・Item Clause・Obtainable等の登録制約もValidatorで検査する。

`enumerateSelections` は登録PartyのコピーをValidatorで検証した後、全20組を昇順slotで一度ずつ列挙する。
検査用Battleの実際の `Side.choose` を使い、合計Lv等を独自に再実装しない。
戻り値の `partyProblems` は登録違反、`rejected[].problems` は各候補の除外理由。
有効な6匹に対し `legal` と `rejected` を合わせると20組となる。
検査用Battleには専用の固定seedを渡し、探索の乱数系列を消費せず、検査後に破棄する。

`first-legal` はslot辞書順の最初の合法組を選び、登録順で出す。先頭が先発。
選出順の6通りは20組の候補数には含めない。順序で先発が変わるため、記録のslotsは順序付きで保存する。
`inspectSelection` は別順序の選出も検査できる。登録順の偏りを解消する戦略ではなく、合法選出の基準方式である。

`EvaluationConfig` に `currentSelection` / `candidateSelection` を指定できる。
`first-legal` と `default` はPlayer AIから独立して選出だけを切り替える。
`legacy`（API省略時）は従来AIの選出を維持し、randomはdefault、simpleはteam 256。

`simple-counter` はWP04の簡易Selection AIで、合法な20候補だけを評価する。Team Previewで公開される相手6匹のspecies/typeだけを使い、各候補の通常技タイプの攻撃範囲から相手speciesのtypeによる被攻撃範囲を引いた整数スコアを計算する。相手Partyに設定されたmoves配列は参照しない。Status技、威力、命中、持ち物、技、状態、相手の非公開情報は使わない。
スコアが高い候補を選び、同点は合計レベル、slot順で決める。先発は候補内の攻撃スコアが高いslot、同点は小さいslot。相手Previewが欠損・6匹未満なら、最初の合法候補へフォールバックする。これは説明可能なベースラインであり、相性や強さの証明ではない。
選出記録にはスコア、ルール説明、相手species要約を保存する。`simple-counter` と `random` / `simple` のPlayer AIは独立して指定できる。
APIで選出指定のない旧設定を読み込んでも、新方式へ黙って切り替えない。
defaultは合計LvルールのautoChooseで低レベル順・同レベル登録順となる。

同じseed・AI・世代数・試合数で上の2コマンドを比較できる。
最初のParty、世代ごとのMutation seed、各Battle seedは共通だが、採否が変わった後はCurrentや変異先も変わり得る。
純粋な1対戦条件の比較には、同じ両Partyとseedで `evaluateParties` の選出方式だけを変える。
優れた戦略や強さの証明として解釈しない。

## 日本語名の表示

`pokemon-display.ts` はShowdown既存の `data/text/ja/pokedex.ts` を使用する。
現行11種をテストし、未登録名は入力された英語名のまま返す。
探索の初期・最終Party、交換、各試合の実選出、旧milestone9/10のParty表示を日本語にする。
Battle内部ログ、species、技・持ち物の識別子、JSONのParty情報は英語のまま保存する。
選出は送信予定コマンドから推測せず、preview後の実際のPlayer requestから観測する。

## 再現性と実験記録

`experiment-rng.ts`で既存ShowdownのGen5 PRNGを利用する。
`JSON.stringify(["wp01-sha256-gen5-v1", experimentSeed, ...path])` をUTF-8でSHA-256へ渡し、
先頭16桁の16進数（64bit）を `gen5,<16桁>` seedにする。
pathは初期生成が `["party"]`、変異が `["mutation", generation]`、
対戦が `["battle", generation, game]`。世代・試合番号は1始まり。
用途ごとに分離しているため、ある世代の乱数消費が別世代のseedをずらさない。
ただしコード・候補プール・設定・依存バージョンが変われば、同seedでも結果は変わり得る。

Runnerには `prng` を渡す。この値がBattle本体のseedとなり、そこから両AIのseedも生成される。
Party BuilderはPRNGを引数で受け取る。旧milestoneの引数省略は非固定乱数のままなので、
再現可能な探索には `runExperiment` またはmilestone11 CLIを使う。

記録は `ai-project/experiments/` のJSON（schemaVersion: 2）へ保存する。
WP02では `experiment.currentSelection/candidateSelection` を明記し、
`generations[].battles[].selections.current/candidate` に実選出のslot・英語species・levelを順序付きで追加する。
先頭が先発。選出前の失敗・模擬Battleでは当該sideの記録が存在しない場合がある。
旧schemaVersion 1のファイル自体は書き換えない。旧experimentをAPIへ渡せばlegacyとして扱う。
新項目を要求する読取側はschemaVersion 2を検査し、旧記録の選出を推測して埋めない。
実験ID・UTC日時・seed由来の識別値をファイル名に含め、UUIDで同時実行時の衝突を避ける。
ID・時刻・保存先は探索の乱数には影響しない。出力ディレクトリ全体はGit管理対象外。

記録には設定、Git commit/dirty状態、Node版、AI/選出/固定座席/採用条件、
初期Party、各世代の変異と両Party、各試合のRunner seed・結果、
勝敗/Draw/Unknown/Errorの集計、採否、最終Party、終了状態を含む。
同じcommit・依存関係を用意してbuildし、JSONの `experiment` を `runExperiment` に渡せば再実行できる。
WP03はschemaVersion 2に任意項目 `playerBehavior.current/candidate` を追加し、判断方針と版を記録する。
`experiment.currentAI/candidateAI` が識別子、`ai` がクラス名、`policy.move/mega` が共通の主要設定。
生成・表示・保存は同じ `PLAYER_SETTINGS` を参照する。旧schemaVersion 1/2にこの追加項目がなくても、
`experiment` をそのまま再実行できる。旧ファイルは変更せず、欠落した方針は保存commitで確認する。
選出方式などを含め、元の設定をそのまま使用するにはAPIを使う：

```js
const fs = require('node:fs');
const { runExperiment } = require('./dist/ai-project/experiment');
const saved = JSON.parse(fs.readFileSync('ai-project/experiments/<記録ファイル>.json', 'utf8'));
runExperiment(saved.experiment).catch(error => { console.error(error); process.exitCode = 1; });
```

比較対象は `experiment`、`ai`、`policy`、`rng`、`initialParty`、`generations`、`finalParty`、`status`。
実行ID・日時は毎回異なる。gitDirtyがtrueの記録はcommitだけでは未commit変更を再現できないため、
正式な再現確認にはcleanなcommitを使用する。

各試合後と世代終了時に一時ファイルを書いてからJSONを置換する。
Unknown/Errorはその試合を記録して停止し、採否はnullのまま。最後に採用済みのPartyを維持する。
捕捉できた例外はfailed、完走はcompleted。強制終了・電源断ではrunningや一時ファイルが残り得る。
保存先のディスク障害まで完全保存は保証しない。途中再開ではなく、同条件で最初から再実行する方式。

## AI・選出・評価条件

`EvaluationConfig`は`format`、`currentAI`、`candidateAI`、`games`を必須とする。
`evaluateParties(current, candidate, config)`の開始時に、その設定と選出方式を表示する。

```ts
const evaluationConfig: EvaluationConfig = {
    format: 'gen2nc2000',
    currentAI: 'random',
    candidateAI: 'random',
    games: 100,
};
```

`experiment-config.ts`で、AI名・選出方式・生成関数を対応付ける。
`createPlayerOptions`は常に`createAI`を渡し、未指定や不明なAI名は実行前にエラーにする。

| 設定 | Player AI | 選出方式 |
| --- | --- | --- |
| `random` | RandomPlayerAI | `default`。NC2000では低レベル優先、同レベルでは登録順 |
| `simple` | SimplePlayerAI | `team 256`。登録2・5・6番目、先発は2番目 |

milestone3～6・10は両側`random`、milestone7～8はBot1が`simple`、Bot2が`random`。
milestone11はCLIの両AI引数で切り替える（省略時は両側random）。
上表はlegacy時の選出。WP02では選出だけを明示的に切り替えられる。
交代判断に関わる`move: 0.7`等もVer.1のRunner既定値を明記して維持した。
Current＝Bot1、Candidate＝Bot2で固定する。WP01ではmilestone11のseed管理だけを追加した。

## 最小限のPlayer AIの判断と検証

WP03では既存 `SimplePlayerAI` を再利用し、行動規則を変更していない。
親の `RandomPlayerAI.receiveRequest` がShowdownのrequestからdisabled技、瀕死や場のポケモン、
交代不能等を処理し、Simpleは渡された技候補の先頭を選ぶ。常に技slot 1を送るわけではない。
PP切れで先頭技がdisabledなら次の利用可能技、技がなくStruggleだけならその候補を選ぶ。
PPや合法性のルールを独自実装せず、Simulatorの候補と最終受理判定を利用する。

通常の技/交代の選択は継承したseed付き乱数判断（交代先がある場合のmove設定0.7）を維持する。
交代先も合法候補からseed付き乱数で選ぶ。強制交代では技を選ばず控えを選び、waitには返答しない。
`mega=0.6` は旧設定互換のため保持するがNC2000では発動しない。
先頭技を選ぶ部分だけが非ランダムであり、AI全体が乱数を使わないという意味ではない。
利用できない手に対する再要求の扱いも親へ任せ、それ以外のエラーは隠さない。

相性、威力、命中、HP、回復タイミング、積み技の効果、相手の行動は評価しない。
合法でも効果のない技を繰り返す可能性があり、強さの改善は主張しない。
検証範囲はgen2nc2000のシングル、現行11固定セットと限定状態のfixture。
未知の世代・形式・壊れたrequestへの一般的な安全性まで保証するものではない。
legacyの固定team 256も旧実験互換用で、任意のレベル構成に対する合法選出保証にはfirst-legalを使う。

`tests/player-ai.test.ts` は実Battleに状態を設定し、生成されたrequestへのAI返答を `Side.choose` で検査する。
通常技、disabled、PP切れ、Struggle、trapped、通常/強制交代、waitを確認する。
状態の発生過程すべてを再現するテストではなく、Simulatorが公開する要求への対応の検証である。
探索→Evaluator→実Runnerの経路では、両席の生成クラスと送信行動を観測し、
simple/random・random/simple・simple/simpleの各条件を2世代×3試合、2回ずつ実行する。
初期Party・変異・実選出・行動・時刻行を除くBattleログ・結果・採否・最終Partyの一致を確認する。
既存の選出独立性、日本語11種、未知名fallback、英語JSON、旧Random探索の回帰テストも維持する。

## 入力型とコピー

`PokemonSetInput`は、能力・性格・性別・EV/IVの省略を許す入力型。
`createPokemonSet`は、それらを補完した独立の`PokemonSet`を作る。
空の性別はShowdown側での決定を維持し、合法性やHidden Powerに必要な調整は従来どおりValidatorに任せる。

EVは経路によって従来の既定値が異なるため、明示して維持する。

- milestone3～8の直接対戦用セット：未指定EVは各0。
- Party BuilderのNC2000セット：Validatorが未指定時に設定していた各252。
- 未指定IV：各31を渡し、Gen 2の変換・検証はShowdownが処理する。

生成・変異・Runnerへの受け渡しで深いコピーを行い、技配列やEV/IVも共有しない。
Candidateの検証や変更がCurrent・候補プールへ漏れることを防ぐ。

## 勝敗の扱い

`|win|Bot 1`、`|win|Bot 2`、`|tie|`を区別する。
終局ログなし・未知の勝者・矛盾する終局ログはエラーで評価を中止し、drawには加算しない。
Runnerの実行エラーも試合番号を付けて伝える。失敗した評価から採否の判断は行わない。
milestone6・10の重複していた集計処理も共通Evaluatorへ統一した。

## 今回の範囲外

相手に応じた戦略的な6→3選出、相性・ダメージ・回復・交代判断、座席交換、Benchmark、
候補セット追加、採用基準・探索アルゴリズムの変更は後続Milestoneで扱う。
default方式のカビゴン不選出や、100試合の僅かな勝ち越しを採用する問題も残る。
新方式では合法候補にカビゴンを含めて出場できるが、常に選ぶ戦略ではない。

## WP05 共通Benchmark

WP05は探索とは分離した固定条件の比較経路を追加した。`benchmark.ts` の
`runBenchmark` は、固定11セットから機械的に作る `registration-first6` と
`registration-last6` の2基準Party、対象側と基準側の両座席を順に実行する。
これらのPartyは登録順を固定するためのfixtureであり、代表性や強さを主張しない。

各試合は `deriveSeed(experimentSeed, "benchmark", baselineId, seat, game)` で独立したseedを持ち、
対象/基準の実選出（slot・species・level）を記録する。結果はtarget、baseline、draw、unknown、errorに分け、
条件ごとの集計と座席・基準Partyを残す。記録形式は探索のschemaとは別の
`kind: common-benchmark` / `schemaVersion: 1` で、JSONは `ai-project/experiments/` に保存される。
試合数は小規模の動作確認用に設定でき、結果から有意差や最強性は主張しない。

実動確認例：

```bash
node dist/ai-project/milestone12.js wp05 10 first6 simple simple-counter
```

このCLIはWP05の対象PartyとAI/選出方式を指定し、基準側をrandom + first-legalに固定する。
既存のmilestone11探索・旧schema記録は変更しない。

## WP06 改善評価系の探索統合

`integrated-experiment.ts` と `milestone13.ts` は、既存のParty Builder→Mutation→評価→採否の探索を保ったまま、
探索前の初期Partyと探索後の最終PartyをWP05の同じ固定Benchmark条件で測定する導線である。
Benchmark用seedは探索seedに `:benchmark` を付けた独立系列から導出し、探索中の勝敗を採否条件へ混ぜない。
採否は従来どおり `candidateWins > currentWins` のみで決まり、探索本体の座席交換も行わない。

```bash
node dist/ai-project/milestone13.js wp06 1 1 simple-counter simple simple
```

記録は探索記録と前後Benchmark（2基準×両座席）を一つの統合JSONにまとめる。Current/CandidateのAIまたは
Selectionが異なる場合は交絡条件として警告し、Party差の根拠として単独解釈しない。小試合数の勝敗から性能改善や
統計的有意差は主張しない。旧milestone11 CLI、旧schema、WP04の公開species/type制約は維持する。

## WP07 独立した最終評価

`final-evaluation-plan.json` は本番実験前に固定した評価計画である。WP05の
`registration-first6` / `registration-last6` と過去ログに出現した6匹系列を避け、固定11セットから未使用と監査した
2基準Partyを使う。評価用seed名前空間、AI、Selection、試合数、両座席、結果分類、失敗時対応も計画に含める。

`final-evaluation.ts` はWP05 Benchmarkとは別の `kind: final-evaluation` 記録を作り、探索前/探索後のPartyを
同じ基準相手・同じ条件で測定する。`milestone14.ts` で実行し、計画JSONは結果に合わせて変更しない。
開発用テストは専用のdummy fixtureとseedを使い、本番用条件を消費しない。勝敗は基準相手別・座席別に保存し、
小規模試合数から最強性や統計的有意差を主張しない。
