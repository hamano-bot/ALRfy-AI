# 議事録アプリ（minutes-record）との切り分け

`platform-common` は共通認証・APIの検証用に、`minutes_record_dev/includes/config.php` を **読み込み専用**で再利用している。議事録本番／開発の挙動を変えないための境界は次のとおり。

## 議事録側に手を入れない前提

- **`minutes_record_dev/.env` をこのリポジトリの作業で書き換えない**（Docker 用の `host=db` 等はそのまま）。
- **`minutes_record_dev/includes/config.php` を platform-common 用に改変しない**（差分が必要になったら別ファイルに切り出す）。
- 議事録のエントリポイント（`public/*.php` 等）は **`platform-common/auth/bootstrap.php` を require しない**（現状どおり）。

## platform-common だけで効くもの

| 対象 | 説明 |
|------|------|
| `platform-common/.env.platform-common` | 共有 `.env` の **後**にだけ読み込み、`putenv` で上書き。ファイルは `platform-common` 直下にのみ置く。議事録のプロセスでは読まれない。 |
| `platform-common/auth/bootstrap.php` | `login.php` / `portal/api/*.php` 等 **platform-common 配下のPHP** が読むときだけ実行される。 |
| `router.php` | ローカル検証用。議事録の Apache/Docker 構成とは無関係。 |

## 環境変数の上書きについて

- `bootstrap.php` 内の `putenv` は **その PHP プロセス内**の `getenv()` に効く。
- 議事録を **別プロセス**（別コンテナ・別 php-fpm ワーカー）で動かしていれば、platform-common の `putenv` は **議事録に伝播しない**。
- 同一ホストで **同一プロセス**を共有する構成は想定しない（通常は別 VirtualHost／別ポート）。

## Google OAuth

- 議事録用と platform-common 用で **リダイレクト URI を分けて** Google Cloud Console に登録する。
- platform-common は `getPlatformGoogleClient()` で **`/callback`**（拡張子なし）を送る。議事録側の `callback.php` 設定と混同しないこと。

## トラブル時の確認

- 議事録だけおかしい → `minutes_record_dev` 直下の変更履歴と、当該デプロイの `.env` を確認（platform-common の `.env.platform-common` は無関係）。
- platform-common だけ DB エラー → `.env.platform-common` の `DB_DSN` と、ホストから MySQL へ届くかを確認。

## 開発用 Docker（minutes_record_dev / docker-compose.dev.yml）と併用する場合

- コンテナ内 MySQL は **ホストから `127.0.0.1:3308`** で接続できる（`3308:3306` マップ）。
- `platform-common/.env.platform-common` の既定例はこれに合わせている。DB コンテナが起動していること（`docker compose -f docker-compose.dev.yml ps` 等）。

## ACL テーブル（project_members 等）

共有 DB に `project_members` / `apps` 等を追加するマイグレーションは **platform-common 配下のみ**（議事録のマイグレーションとは別ファイル）。手順・シード方針は [acl_database.md](acl_database.md) を参照。

## ダッシュボードから議事録へのリンク

`apps.route` の既定はプレースホルダのままにし、**表示用 URL** は `platform-common/.env.platform-common` の **`MINUTES_RECORD_PORTAL_URL`** で上書きする（`portal/includes/portal_apps_service.php` の `portalResolveAppRoute()`）。

### 同一ホスト入口（`/minutes`）と議事録本体 URL の両立

次の **2 つを同時に使える**ようにしている。

| 公開 URL | 役割 |
|----------|------|
| `http://dev-ALRfy-AI.com:8001/minutes` | platform-common（`php -S` + `router.php`）の **ゲート**。`MINUTES_RECORD_MEETINGS_URL` へ **302** する。 |
| `http://minutes-record.com:8080/meetings` | 議事録アプリ本体の会議一覧（開発なら `:8081` など環境に合わせる）。 |

- **`MINUTES_RECORD_PORTAL_URL`** — ダッシュボード「開く」の `href`。例: `http://dev-ALRfy-AI.com:8001/minutes`
- **`MINUTES_RECORD_MEETINGS_URL`** — `/minutes` がリダイレクトする先。例: `http://minutes-record.com:8080/meetings`（開発中は `:8081/meetings` にするとよい）

`hosts` で `minutes-record.com` / `dev-ALRfy-AI.com` をローカルに向けている前提。
