# project-manager-web

Next.js（App Router）+ TypeScript + Tailwind のスキャフォールドです。

## 前提

- Node.js 20 LTS 以上（`node` / `npm` が PATH に通っていること）

## セットアップ

```bash
cd project-manager/apps/web
npm install
npm run dev
```

ブラウザで http://localhost:3000 を開く。

## スクリプト

| コマンド | 説明 |
|----------|------|
| `npm run dev` | 開発サーバー（Turbopack） |
| `npm run build` | 本番ビルド |
| `npm run start` | 本番サーバー（`build` 後） |
| `npm run lint` | ESLint |

## ディレクトリ

- `app/` — App Router（`layout.tsx`, `page.tsx`）
- `docs/` — 案件ドキュメント用 Markdown（既存のまま）
