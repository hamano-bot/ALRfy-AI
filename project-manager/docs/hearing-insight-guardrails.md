# ヒアリングテンプレ insight（非ベクトル前提のコスト・品質ガード）

## 方針

- **ベクトル DB は使わない。** 類似検索に頼らず、`hearing_analytics_items` の **行フラット**と **`template_id` フィルタ**で対象を絞る。
- **Gemini 入力は短く:** 日次バッチは `hearing-insight-export` の **デルタ**（`project_hearing_sheets.updated_at` > 前回 `last_run_at`）のみ。テンプレ種別ごとに **1 リクエスト**。
- **トークン上限:** `hearing-gemini-merge` のプロンプトは集計済み行のテキスト列挙に留める。異常に多い場合は将来 `MAX_ROWS_PER_TEMPLATE` でクリップ可能。
- **プロファイル一致:** ingest 時に `resolveHearingTemplateId` 相当と `body_json.template_id` が一致しない行は `excluded_reason = profile_mismatch`。
- **クライアント専用除外:** 分類・見出しが `[クライアント専用]` 等のルールに合致する行は `client_specific` で除外（`hearing_analytics_ingest.php`）。

## 運用

- **Cron:** `POST /api/cron/hearing-template-insight` に `X-Cron-Secret: <HEARING_INSIGHT_CRON_SECRET>`（または `Authorization: Bearer` 同値）。1 日 1 回程度を推奨。
- **環境変数:** ポータル PHP と Next の両方で **`HEARING_INSIGHT_CRON_SECRET`** を同一に設定する。
