# 分類を自動セット（Gemini）

## 概要

ヒアリング表の「分類」列を、見出し・確認事項（＋案件マスタ・テンプレの分類例）から Gemini が提案する機能。プレビュー後に「表に反映」し、保存は既存の保存ボタンと同じ。

## API

- **`POST /api/hearing-sheet/auto-category`**
- ボディ: `project`（アドバイス API と同形の案件要約）、`template_id`、`rows`（対象行のみ `{ id, heading, question, category }`）、`style`（`indexed` | `label_only`）、`extra_rules`（任意）
- 応答: `labels: { id, label }[]`（連番は含めないラベル部分）

## 連番（クライアント）

- **`indexed` + すべての行**: 表の上から順に、返却ラベルへ `01`〜`99` の2桁ゼロ埋めを付与（ラベル行が欠けた行は変更しない）。
- **`indexed` + 分類が空欄の行のみ**: 更新しない行の分類から先頭2桁（`^\d{2}`）を走査し占有番号を集め、空欄行を上から順に空いている番号で埋める。
- **`label_only`**: ラベルをそのまま分類にセット（対象行のみ）。

## 実装ファイル

- Gemini: [`apps/web/lib/hearing-auto-category-gemini.ts`](../apps/web/lib/hearing-auto-category-gemini.ts)
- 連番・マージ: [`apps/web/lib/hearing-category-numbering.ts`](../apps/web/lib/hearing-category-numbering.ts)
- UI: [`apps/web/app/project-list/[projectId]/hearing/HearingAutoCategoryDialog.tsx`](../apps/web/app/project-list/[projectId]/hearing/HearingAutoCategoryDialog.tsx)
