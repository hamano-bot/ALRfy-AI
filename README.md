# ALRfy-AI_dev

共通基盤（`platform-common`）と案件管理（`project-manager`）などを置く開発用ワークスペースです。

## レイアウト（概要）

- `platform-common/` — 共通認証・ポータル API・ACL 用マイグレーション等（PHP）
- `project-manager/` — 案件管理（Next.js 等・準備中）
- `.cursor/rules/` — エディタ向けルール

議事録アプリ本体は別管理の前提で、このリポには含めません。

## セットアップ（platform-common）

`platform-common/.env.platform-common.example` をコピーして `.env.platform-common` を作成し、DB 等を設定してください（`.env.platform-common` はコミットされません）。
