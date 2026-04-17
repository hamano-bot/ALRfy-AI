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
- **`/project-manager`** — Project（Next）

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

**注意:** 同じ PC で `platform-common` を `php -S ... 8001` している場合、**8001 はどちらか一方**しか使えません。Project（Next）を 8001 にするなら PHP 側は別ポート（例: 8002）にするか、一方を止めてください。

**`git pull` やリモートからの更新のあと:** すでに **`npm run dev:lan` を動かしている**場合は、**いったんそのターミナルで Ctrl+C で止めてから**、同じコマンドで起動し直してください（または **`npm run dev:lan:reset`**）。pull だけして dev を走らせたままにすると、キャッシュされた `.next` と新しいソースが食い違い、**真っ黒の `Internal Server Error`** や **CSS が効かない表示**になりやすいです。

**スタイルが消えた／真っ黒で `Internal Server Error` だけ:** 多くは **8001 に古い Next が残っている**か、**`npm run clean` したあと dev を再起動していない**ためです。`npm run dev:lan` は起動前に **8001 を解放**します（`kill-port`）。それでも直らないときは **`npm run dev:lan:reset`**（解放 → `.next` 削除 → dev）。**HMR なしで安定**させたいときは `npm run build` のあと **`npm run start:lan`**（同じ 8001）。`dev:lan:turbo`（Turbopack）と webpack の `build` / `dev:lan` で同じ `.next` を行き来するとチャンク不整合で CSS が落ちることがあります。

**hosts 名で開いたのに文字だけで CSS が一切当たらない:** Next.js 15 の **`allowedDevOrigins`** は、**`dev-alrfy-ai.com:8001` のようにポート付き**で書かないと `/_next/static/` のスタイルがブロックされることがあります。`next.config.ts` を更新したら **`npm run dev:lan` を再起動**してください。

## PHP（platform-common）と Next の併用（推奨）

**ポートを分ける:** Next（例: `3000` や LAN 用 `8001`）と `platform-common` の PHP（例: **`8000`**）は **別プロセス・別ポート**にしてください。`php -S ... 8001` と `npm run dev:lan` を同時に 8001 で動かすことはできません。

### 手順（2 ターミナル）

1. **ターミナル A — PHP**（リポジトリルートから `platform-common` へ）:

   ```powershell
   cd platform-common
   .\dev-router.ps1
   ```

   別の待受にする場合（例）: `.\dev-router.ps1 -Listen "127.0.0.1:8002"`  
   macOS / Linux: `./dev-router.sh` または `./dev-router.sh 127.0.0.1:8002`

   これは `php -S 127.0.0.1:8000 router.php` と同等で、`router.php` により `/portal/api/apps` など拡張子なし URL が有効になります。

2. **ターミナル B — Next**（本 README がある `project-manager/apps/web` で）:

   ```powershell
   npm run dev
   ```

   LAN 用ホスト名で試す場合は `npm run dev:lan`（ポート **8001**）。

3. **`.env.local`**（git 管理外）に、ターミナル A の待受と一致する **`PORTAL_API_BASE_URL`** を **末尾スラッシュなし**で書き、Next を再起動します。

   ```bash
   PORTAL_API_BASE_URL=http://127.0.0.1:8000
   ```

   PHP を `8002` で動かしたなら `http://127.0.0.1:8002` に合わせます。

4. Next のプロセスから `PORTAL_API_BASE_URL` に **HTTP で到達できる**こと（ファイアウォール・ループバック）を確認してください。

## ポータル BFF（アプリ一覧）

ダッシュボードの **アプリカード** と **左サイドメニュー**は、同一オリジンの `GET /api/portal/apps`（Next Route Handler）経由で `platform-common` の `GET /portal/api/apps` を参照します。上記のとおり PHP を別ポートで起動し、`.env.local` の `PORTAL_API_BASE_URL` をそのオリジンに合わせてください。

**実効ロール（`?project_id=` または `NEXT_PUBLIC_DEFAULT_PROJECT_ID`）**の帯表示も、同じ **`PORTAL_API_BASE_URL`** 経由で `GET /api/portal/project-permission` → PHP の `/portal/api/project-permission` を呼びます。未設定のまま `project_id` だけ付けると、帯に設定手順のエラーが出ます。

ヘッダーの **表示名・テーマ初期値**は `GET /api/portal/me`（→ PHP `GET /portal/api/me`）です。`PORTAL_API_BASE_URL` が無い、または未ログインのときはデモ表示のままです。

**`/project-manager`** の **所属案件一覧**は、サーバー側で `GET /portal/api/my-projects` を呼びます（同一オリジンの BFF は `GET /api/portal/my-projects`）。**`/project-manager/[projectId]`** は同じくサーバー側で **`my-projects`（メタ）と `project-permission`（実効ロール）** を並列取得します（ダッシュボード帯と同一上流）。PHP にログイン済み Cookie が届くよう、`.env.local` の `PORTAL_API_BASE_URL` と PHP 起動を揃えてください。

方針の詳細は [`bff-portal-integration-decisions.md`](../../docs/engineering/bff-portal-integration-decisions.md) を参照してください。

## スクリプト

| コマンド | 説明 |
|----------|------|
| `npm run clean` | `.next` を削除（キャッシュ不整合・`Cannot find module './NNN.js'` 等の切り分け用） |
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
