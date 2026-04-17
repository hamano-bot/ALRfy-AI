# project-manager-web

Next.js（App Router）+ TypeScript + Tailwind のスキャフォールドです。

## 前提

- Node.js 20 LTS 以上（`node` / `npm` が PATH に通っていること）

## `npm` が認識されないとき（Windows）

Node.js をインストールした直後は、**ターミナルを一度閉じて開き直す**か、**Cursor を再起動**すると PATH が反映されることが多いです。

**すぐに開発サーバーだけ動かす**（PATH を触らない）:

```powershell
cd project-manager/apps/web
.\dev.ps1
```

初回の `npm install` も同様に:

```powershell
.\install.ps1
```

`.\dev.ps1` が「スクリプトの実行がシステムで無効」と出る場合は、管理者でなくてよいので一度だけ:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

手動で PATH を直す場合:

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

URL の役割:

- **`/`** — ダッシュボード（Next）
- **`/project-manager`** — 案件管理（Next）

例:

- ローカル: http://localhost:3000/ · http://localhost:3000/project-manager
- LAN 用（下記）: http://dev-ALRfy-AI.com:8001/ · http://dev-ALRfy-AI.com:8001/project-manager

## 開発 URL（`dev-ALRfy-AI.com:8001`）

1. **hosts** に例: `127.0.0.1 dev-ALRfy-AI.com`（既存の誤記 `dev-alrfy-ai.com` や LAN 用 `192.168.x.x` 行と重複しないよう整理）
2. ポート **8001** で Next を起動:

```bash
npm run dev:lan
```

PowerShell で PATH が通らない場合は `.\dev-lan.ps1`。

**注意:** 同じ PC で `platform-common` を `php -S ... 8001` している場合、**8001 はどちらか一方**しか使えません。案件管理を 8001 にするなら PHP 側は別ポート（例: 8002）にするか、一方を止めてください。

## スクリプト

| コマンド | 説明 |
|----------|------|
| `npm run dev` | 開発サーバー（Turbopack、既定ポート 3000） |
| `npm run dev:lan` | ポート **8001**、ホスト **0.0.0.0**（上記 URL 向け。Windows では Turbopack より安定なため webpack 開発サーバー） |
| `npm run dev:lan:turbo` | 同上で **Turbopack**（速いが環境によっては `.next` 不整合で 500 になりやすい） |
| `npm run build` | 本番ビルド |
| `npm run start` | 本番サーバー（`build` 後。既定 3000） |
| `npm run lint` | ESLint |

## UI文言ルール（共通）

- 画面の閉じる操作ラベルは **`Close`** に統一する。
- 新規画面・モーダル・ドロワー・BottomSheet も同様に **`Close`** を使う。
- `閉じる` / `キャンセル` など別表記は、明確な要件がない限り使用しない。

## ディレクトリ

- `app/` — App Router（`layout.tsx`, `page.tsx`＝`/`, `project-manager/page.tsx`＝`/project-manager`）
- `docs/` — 案件ドキュメント用 Markdown（既存のまま）
