# ACL データベース（共有 `minutes_record_db`）

`auth/permission_helper.php` と `portal/api/*.php` が参照するテーブルを、議事録と同じ MySQL データベースに配置する。マイグレーション SQL は **platform-common 側**のみに置き、議事録アプリの PHP は変更しない。

## テーブルと役割

| テーブル | 用途 |
|----------|------|
| `projects` | プロジェクト（案件）の論理コンテナ。`project_members.project_id` の参照先。 |
| `project_members` | `user_id` × `project_id` のロール（`owner` / `editor` / `viewer`）。 |
| `resource_members` | リソース単位の上書き。`resolveEffectiveRole()` は **resource を優先**し、なければ project。 |
| `apps` | ポータルに載せるアプリ行（`app_key`, `name`, `route`, …）。 |
| `app_access_policies` | 各アプリに必要な `required_role`（`GET /me` / `GET /apps` の表示判定）。 |
| `resource_acl_logs` | 権限変更の監査ログ（将来の管理画面用。現状はスキーマのみ）。 |

`hasAnyMembership()` は `PLATFORM_COMMON_SKIP_MEMBERSHIP_CHECK` が `1` のとき常に true。本番相当にするには **`project_members` または `resource_members` に 1 行以上**あるユーザーのみが API 利用可（`0` にすると実効化）。

## マイグレーション SQL の所在

| ファイル | 内容 |
|----------|------|
| [database/migrations/20260417_platform_acl_and_apps.sql](../database/migrations/20260417_platform_acl_and_apps.sql) | DDL + 既定プロジェクト `id=1` + `apps` / `app_access_policies` の初期行 |

## 適用手順（例）

```bash
# Docker の MySQL が 127.0.0.1:3308 の例
mysql -h 127.0.0.1 -P 3308 -u root -p minutes_record_db < platform-common/database/migrations/20260417_platform_acl_and_apps.sql
```

**Windows / PowerShell 注意:** パイプで SQL を流すと UTF-8 のコメントが化けて MySQL が構文エラーになることがあります。その場合はコンテナにファイルをコピーしてから実行してください。

```powershell
docker cp platform-common/database/migrations/20260417_platform_acl_and_apps.sql minutes-db-dev:/tmp/acl_migration.sql
docker exec minutes-db-dev sh -c "mysql -uroot -proot --default-character-set=utf8mb4 minutes_record_db < /tmp/acl_migration.sql"
```

## シード方針

| シナリオ | 推奨 |
|----------|------|
| **開発**（既存ユーザーがログインできなくなるのを防ぐ） | マイグレーション後に [database/seeds/20260417_dev_default_project_members.sql](../database/seeds/20260417_dev_default_project_members.sql) を実行し、**全 `users` をプロジェクト 1 に `editor` で追加**する。 |
| **本番** | マイグレーションのみ適用し、`project_members` は運用で追加（招待フロー・管理画面・手動 SQL）。シード SQL は実行しない。 |
| **ロール検証** | 特定ユーザーを `viewer` のみに落とし、`GET /apps` で `project-manager` が `visible_disabled` になることを確認（`app_access_policies.required_role = editor` のため）。 |

## `PLATFORM_COMMON_SKIP_MEMBERSHIP_CHECK` の切り替え

1. マイグレーション適用。
2. 開発なら dev シードで少なくとも自分の `user_id` を `project_members` に含める。
3. `platform-common/.env.platform-common` で `PLATFORM_COMMON_SKIP_MEMBERSHIP_CHECK=0`（または行削除）。
4. `GET /portal/api/me` が 200 になることを確認。所属ゼロのユーザーは `409` / `unassigned_user`。

## ロール文字列

`permission_helper.php` の `rolePriority()` と一致させる: `owner` > `editor` > `viewer`。それ以外は `0` 扱い。

## ロールバック

外部キー依存のため、手動で子→親の順に `DROP TABLE` する。検証環境の再作成が簡単なら DB ダンプから復元でもよい。
