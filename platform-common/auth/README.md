# platform-common/auth

共通Googleログインの実装領域。

## このディレクトリで扱うもの
- OAuth コールバック処理
- `google_sub` と内部 `user_id` のマッピング
- セッション発行/破棄
- 認証失敗時の分岐（再ログイン/権限申請）

## 実装時の必須ルール
- トークン平文はDBへ保存しない。
- セッションはハッシュ値のみ保持する。
- ログイン後遷移は原則ダッシュボード。

## 議事録アプリとの境界
- 共有 `config.php` は読み込みのみ。議事録側の `.env` を書き換えない運用とする。
- 詳細: [integration_minutes_record.md](../docs/integration_minutes_record.md)

## ローカルDB（ホストの `php -S`）
- Docker 用 `DB_DSN`（`host=db`）では接続できない場合は `platform-common/.env.platform-common` で上書き（`.env.platform-common.example` 参照）。議事録の `.env` は変更しない。
