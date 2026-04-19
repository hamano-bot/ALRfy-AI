# Excel 取り込みとマージ（ヒアリングシート）

## 処理の流れ

1. **API**（`POST /api/hearing-sheet/import-excel`）: Excel の先頭シートをテキスト化し、案件の `template_id` に対応するヒアリング行へ Gemini がマッピングする。
2. **クライアント**（`mergeHearingItems`）: 画面上の現在の行と取り込み結果を、選択したマージ方法で合成する。プレビュー後に「表に反映」し、保存で DB に書き込む。

## 行の同一判定（改定仕様）

- **分類（category）は、マージの判定・重複検出に使わない。**
- **見出し（heading）** と **確認事項（question）** を正規化（trim + 小文字化）したうえで、組 `norm(heading)|norm(question)` で照合する。
- 見出し・確認事項が両方空の行は、取り込み行の追加・照合の対象外（スキップ）。

## マージ方法

| モード | 動作 |
|--------|------|
| **すべて置換** | 現在の表を使わず、取り込み行のみを採用する。 |
| **空欄を埋める** | 既存行の並び・ id を維持。見出し＋確認事項が一致する取り込み行から、空のセルのみ上書き。取り込みにあって表に無い組は末尾に追加。 |
| **行を追加のみ** | 既存行は変更しない。見出し＋確認事項の組が未登録の取り込み行だけ末尾に追加。 |

実装: [`apps/web/lib/hearing-import-merge.ts`](../apps/web/lib/hearing-import-merge.ts)

## プレビューと解析中 UI

- **解析中**: ダイアログ内にオーバーレイでスピナー・フェーズ文言・目安％（擬似）・経過秒を表示。`prefers-reduced-motion: reduce` ではスピナー回転とプログレスのパルスを抑止。
- **プレビュー**: マージ後の全行を表で表示。行種別（取込／追加／更新／—）と、既存行で値が変わるセルをハイライト（`diffPreviewRows`）。

UI: [`apps/web/app/project-list/[projectId]/hearing/HearingImportExcelDialog.tsx`](../apps/web/app/project-list/[projectId]/hearing/HearingImportExcelDialog.tsx)
