# WP01B ローカル観察画面

`npm run build` 後、リポジトリ直下で `node dist/ai-project/wp01b-observation.js 3 ai-project/observations/wp01b` を実行します。3試合のJSONとHTMLが生成されます。Windows 11では、生成されたファイルを `Start-Process .\ai-project\observations\wp01b\<matchId>.html` で開いてください（エクスプローラーでダブルクリックしても構いません）。

画面は同じ保存JSONの公開イベント列から作られ、前後ターンを確認できます。`rawLog` はシミュレータの観測用ログで非公開情報を含み得るため画面には表示しません。日本語欄は原文イベントを機械的に対応づけ、未対応イベントを `[原文]` のまま保存します。現行Runnerの公開APIではinputLogを取得できないため、記録ではnullと理由を明示しています。外部通信やShowdownへのアップロードは行いません。
