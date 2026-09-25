# Pokémon GSC AI Project — Ver.2 Milestone 1

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
- `test:ai`：通常build後に回帰テストと実際のEvaluatorによる6試合のsmoke testを実行する。
  個々の勝者は乱数で変わるため、特定の勝率ではなく接続・完走・集計を検査する。
  build済みなら`node --test dist/ai-project/tests/milestone1.test.js`でも実行できる。

探索の実行は従来どおり：

```sh
node dist/ai-project/milestone11.js
```

10世代×100試合を実行する。テストのために探索全体を回す必要はない。

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

milestone3～6・10～11は両側`random`、milestone7～8はBot1が`simple`、Bot2が`random`。
今回、実際に使っていたAIを明示しただけで、戦略や選出は改善していない。
交代判断に関わる`move: 0.7`等もVer.1のRunner既定値を明記して維持した。
Current＝Bot1、Candidate＝Bot2で固定し、seed管理はまだ行わない。

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

6→3選出の改善、相性・ダメージ・回復・交代判断、seed管理、座席交換、Benchmark、
候補セット追加、採用基準・探索アルゴリズムの変更は後続Milestoneで扱う。
現在のdefault選出がカビゴンを出さない問題や、100試合の僅かな勝ち越しを採用する問題も残る。
