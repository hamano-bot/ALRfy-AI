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
- **`/project-list`** — Project（案件一覧・Next）

例:

- ローカル: http://localhost:3000/ · http://localhost:3000/project-list
- LAN 用（下記）: http://dev-ALRfy-AI.com:8001/ · http://dev-ALRfy-AI.com:8001/project-list

## 開発 URL（`dev-ALRfy-AI.com:8001`）

1. **hosts** に例: `127.0.0.1 dev-ALRfy-AI.com`（既存の誤記 `dev-alrfy-ai.com` や LAN 用 `192.168.x.x` 行と重複しないよう整理）
2. ポート **8001** で Next を起動:

```bash
npm run dev:lan
```

PowerShell で PATH が通らない場合は `.\dev-lan.ps1`。

**日常の開発（`dev:lan:reset` を毎回打たなくてよい）:** 普段は **`npm run dev:lan` を一度起動したら**、止めるときは **Ctrl+C**、再開するときは **また `npm run dev:lan` だけ**でよい（`.next` を毎回消す必要はない）。**`npm run dev:lan:reset`**（ポート解放 → `.next` 削除 → dev）は、**強制再読み込みでも `/_next` が 404 のまま**など、明らかにおかしいときの **切り札**に留めると効率がよいです。負荷の高い **`next build`** を開発中に何度も挟むと `.next` が webpack 用と本番用でぶつかりやすいので、**動作確認だけなら** `dev:lan` のままにし、本番相当の確認は **`npm run build` → `npm run start:lan`** をまとめて行うのが安全です。**同じ日の作業では** `dev:lan`（webpack）と `dev:lan:turbo`（Turbopack）を **行き来しない**（混ぜるとチャンク不整合が出やすい）。このリポジトリの `next.config.ts` では、**開発時だけ webpack のキャッシュをメモリ**に寄せ、Windows で HMR と古いチャンク参照が残りにくいようにしています（`--turbopack` 利用時は webpack が無効のため対象外）。

**注意:** 同じ PC で `platform-common` を `php -S ... 8001` している場合、**8001 はどちらか一方**しか使えません。Project（Next）を 8001 にするなら PHP 側は別ポート（例: 8002）にするか、一方を止めてください。

**`git pull` やリモートからの更新のあと:** すでに **`npm run dev:lan` を動かしている**場合は、**いったんそのターミナルで Ctrl+C で止めてから**、同じコマンドで起動し直してください（または **`npm run dev:lan:reset`**）。pull だけして dev を走らせたままにすると、キャッシュされた `.next` と新しいソースが食い違い、**真っ黒の `Internal Server Error`** や **CSS が効かない表示**になりやすいです。

**スタイルが消えた／真っ黒で `Internal Server Error` だけ:** 多くは **8001 に古い Next が残っている**か、**`npm run clean` したあと dev を再起動していない**ためです。`npm run dev:lan` は起動前に **8001 を解放**します（`kill-port`）。それでも直らないときは **`npm run dev:lan:reset`**（解放 → `.next` 削除 → dev）。**HMR なしで安定**させたいときは `npm run build` のあと **`npm run start:lan`**（同じ 8001）。`dev:lan:turbo`（Turbopack）と webpack の `build` / `dev:lan` で同じ `.next` を行き来するとチャンク不整合で CSS が落ちることがあります。

**hosts 名で開いたのに文字だけで CSS が一切当たらない:** Next.js 15 の **`allowedDevOrigins`** は、**`dev-alrfy-ai.com:8001` のようにポート付き**で書かないと `/_next/static/` のスタイルがブロックされることがあります。`next.config.ts` を更新したら **`npm run dev:lan` を再起動**してください。

**ファイルを保存するたびにスタイルが当たらない（裸の HTML に戻る）:** 開発モードでは **HMR（ホットリロード）** が `/_next/static/` 以下の CSS・JS を差し替えます。このとき (1) **Turbopack**（`dev:lan:turbo`）と **webpack**（`dev:lan`）や **`next build`** を同じ `.next` で行き来するとチャンク ID がずれ、**スタイル用ファイルの参照だけ古いまま**になることがあります。(2) **Fast Refresh がフルリロード**に落ちると、一瞬〜数秒だけスタイルが抜けたように見えることもあります。**対処:** ずっと同じ dev コマンドだけ使う／混ぜたら **`npm run dev:lan:reset`**。ブラウザの開発者ツール **Network** で `/_next/static/css/...` や `/_next/static/chunks/...` が **赤（403・404）** なら、上記の `allowedDevOrigins` かキャッシュ不整合です。**見た目だけ安定**させたいときは `npm run build` → **`npm run start:lan`**（HMR なし）。

**Console に `webpack.js`・`layout.css`・`page.css` など `/_next/static/` 一式が 404 と並ぶ:** 多くは **ページの HTML が古いチャンク名を指したまま**か、**`.next` と起動中の dev が食い違っている**ときです（`next build` と `next dev` の混在直後、HMR 失敗直後、別タブの古いセッションなど）。**まず** DevTools を開いた状態で **Network →「キャッシュを無効にする」にチェック** → **強制再読み込み（Ctrl+Shift+R）**。それでも 404 なら **`npm run dev:lan:reset`**。新しいタブで `http://dev-alrfy-ai.com:8001/_next/static/chunks/webpack.js` を開き、**404 のまま**なら dev が正しく立っていないかポートが別プロセスです。

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

### `dev-alrfy-ai.com:8001` でログインだけ統一したい場合

- `hosts` に例: `127.0.0.1 dev-alrfy-ai.com` を追加（大文字小文字は OS 次第）。
- **Next** は `npm run dev:lan`（**8001**）。**PHP** は **別ポート**（例 `127.0.0.1:8000`）で `platform-common` の `.\dev-router.ps1` を起動。
- `.env.local` の `PORTAL_API_BASE_URL` は **Next サーバーから見た PHP の URL**（例 `http://127.0.0.1:8000`）でよい。ブラウザで `http://127.0.0.1:8000` を開く必要はない。
- ブラウザからは **`http://dev-alrfy-ai.com:8001/login`** で Google ログイン（Next の Route Handler が PHP へ転送し、`X-Forwarded-Host` で OAuth の `redirect_uri` が `http://dev-alrfy-ai.com:8001/callback` になる）。
- Google Cloud Console の **OAuth クライアント**に、**承認済みのリダイレクト URI** として `http://dev-alrfy-ai.com:8001/callback` を追加する。

## ポータル BFF（アプリ一覧）

ダッシュボードの **アプリカード** と **左サイドメニュー**は、同一オリジンの `GET /api/portal/apps`（Next Route Handler）経由で `platform-common` の `GET /portal/api/apps` を参照します。上記のとおり PHP を別ポートで起動し、`.env.local` の `PORTAL_API_BASE_URL` をそのオリジンに合わせてください。

**実効ロール（`?project_id=` または `NEXT_PUBLIC_DEFAULT_PROJECT_ID`）**の帯表示も、同じ **`PORTAL_API_BASE_URL`** 経由で `GET /api/portal/project-permission` → PHP の `/portal/api/project-permission` を呼びます。未設定のまま `project_id` だけ付けると、帯に設定手順のエラーが出ます。

ヘッダーの **表示名・テーマ初期値**は `GET /api/portal/me`（→ PHP `GET /portal/api/me`）です。`PORTAL_API_BASE_URL` が無い、または未ログインのときはデモ表示のままです。

**`/project-list`** の **所属案件一覧**は、サーバー側で `GET /portal/api/my-projects` を呼びます（同一オリジンの BFF は `GET /api/portal/my-projects`）。**`/project-list/[projectId]`** は同じくサーバー側で **`my-projects`（メタ）と `project-permission`（実効ロール）** を並列取得します（ダッシュボード帯と同一上流）。PHP にログイン済み Cookie が届くよう、`.env.local` の `PORTAL_API_BASE_URL` と PHP 起動を揃えてください。旧パス **`/project-manager`** は **`/project-list` へ 301 リダイレクト**します。

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

- `app/` — App Router（`layout.tsx`, `page.tsx`＝`/`, `project-list/page.tsx`＝`/project-list`）
- `docs/` — 案件ドキュメント用 Markdown（既存のまま）
