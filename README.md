# ALRfy-AI_dev

共通基盤（`platform-common`）と案件管理（`project-manager`）などを置く開発用ワークスペースです。

## レイアウト（概要）

- `platform-common/` — 共通認証・ポータル API・ACL 用マイグレーション等（PHP）
- `project-manager/apps/web/` — 案件管理フロント（Next.js App Router・スキャフォールド済み。`npm install` / `npm run dev` は [project-manager/apps/web/README.md](project-manager/apps/web/README.md) 参照）
- `.cursor/rules/` — エディタ向けルール

議事録アプリ本体は別管理の前提で、このリポには含めません。

## セットアップ（platform-common）

`platform-common/.env.platform-common.example` をコピーして `.env.platform-common` を作成し、DB 等を設定してください（`.env.platform-common` はコミットされません）。

## ローカルで Next ダッシュボード + ポータル API（ポート分離）

Next（`project-manager/apps/web`）と PHP（`platform-common`）は **別ポート**で動かすのが前提です（同一ポートに PHP と Next を載せない）。

1. **ターミナル A** — `platform-common` で PHP 組み込みサーバー（既定 **127.0.0.1:8000**）:

   ```powershell
   cd platform-common
   .\dev-router.ps1
   ```

   macOS / Linux の場合は `./dev-router.sh`。

2. **ターミナル B** — `project-manager/apps/web` で Next（例: `npm run dev` の **3000**、または `npm run dev:lan` の **8001**）。

3. **`project-manager/apps/web/.env.local`** に `PORTAL_API_BASE_URL=http://127.0.0.1:8000` を書き（ターミナル A の listen と一致）、Next を再起動。

手順の詳細とトラブルシュートは [project-manager/apps/web/README.md](project-manager/apps/web/README.md) を参照してください。

## リモート（GitHub）

- **origin:** [https://github.com/hamano-bot/ALRfy-AI](https://github.com/hamano-bot/ALRfy-AI)

別ブランチをプッシュしたときは `git push -u origin <branch>`。別マシンでクローンする場合:

```bash
git clone https://github.com/hamano-bot/ALRfy-AI.git
```
