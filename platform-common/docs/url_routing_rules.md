# URLルーティング実装ルール（`.php` をURLに出さない）

## 目的

- ブラウザ・アプリから見える **公開URLに `*.php` を含めない**。
- 実装ファイル名は `*.php` でもよいが、**論理パス（ルート）とファイルパスを分離**する。
- `minutes-record` / `project-manager` / `platform-common` を横断して **同じ考え方**で揃える。

## 必須ルール

- 新規の画面・API・OAuth コールバック・Webhook は、**拡張子なしのパス**で設計する（例: `/api/me`, `/auth/callback`, `/login`）。
- 仕様書・OpenAPI・フロントの fetch 先は、**拡張子なしURLを正**とする。
- サーバー設定（リライト／フロントコントローラ）で、内部の `*.php` へマッピングする。
- **例外**: 既存プロダクトで既に公開済みの `*.php` URL は、互換のため **段階的移行**（301／両対応期間）で扱う。

## 推奨パス例

| 種別 | 良い例 | 避ける例（新規） |
|------|--------|------------------|
| API | `/api/me`, `/api/v1/projects/10/permission` | `/portal/api/get_me.php` |
| 認証 | `/login`, `/auth/callback` | `/login.php`, `/callback.php` |
| 画面 | `/dashboard`, `/minutes`, `/settings` | `/dashboard.php`, `/minutes.php` |
| 静的 | `/assets/...` | 変更なし |

## 実装パターン（環境別）

### 1. Apache（`mod_rewrite`）

- `DocumentRoot` 配下に `.htaccess` または vhost で `RewriteRule` を定義。
- 典型的には「存在しないパスは `index.php` に丸投げ（フロントコントローラ）」。

### 2. Nginx

- `try_files` で実ファイルがなければ `/index.php` にフォールバック。
- または `location` ごとに `fastcgi_param SCRIPT_FILENAME` を固定。

### 3. PHP 組み込みサーバー（開発用）

- `php -S host:port router.php` の **router スクリプト**でパスを解決し、内部で `require` する。
- `php -S ... -t docroot` のみでは拡張子なしURLは扱いにくいため、**router 必須**とする。
- 本リポジトリ例: `platform-common` で `php -S 0.0.0.0:8001 router.php`（`router.php` はリポジトリ内）。

### 4. Next.js（`project-manager` 等）

- App Router / `rewrites` / Route Handlers で **拡張子なし**が標準。本ルールと一致させる。

## OAuth / 外部連携の注意

- Google Cloud Console の **承認済みリダイレクト URI** は、**実際にブラウザが開くURL**と完全一致させる。
- 公開URLを `/auth/callback` に統一するなら、Console にも **`https://example.com/auth/callback`** のように **拡張子なし**で登録し、サーバー側で内部の `callback.php` 等へ転送する。

## 移行方針（レガシー `*.php` がある場合）

1. 拡張子なしURLを正とする。
2. 旧URLは一定期間 **301 リダイレクト**または **同一実装のエイリアス**。
3. ドキュメント・クライアントを新URLへ更新。
4. 監視上の参照がなくなったら旧URLを廃止。

## 本リポジトリ（`platform-common`）について

- 現状の `portal/api/get_me.php` 等は **移行途中の実装**として存在しうる。
- 新規作業では本ドキュメントに従い、**ルーター＋拡張子なしパス**へ寄せることを推奨する。
