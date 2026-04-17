# project-manager-web

Next.js（App Router）+ TypeScript + Tailwind のスキャフォールドです。

## 前提

- Node.js 20 LTS 以上（`node` / `npm` が PATH に通っていること）

## `npm` が認識されないとき（Windows）

Node.js をインストールした直後は、**ターミナルを一度閉じて開き直す**か、Cursor を再起動すると PATH が反映されます。それでも出ない場合は PowerShell で次を実行してから `npm` を試してください。

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

または `C:\Program Files\nodejs\` が PATH に含まれているか確認。

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
