# ACL データベース（共有 `minutes_record_db`）

`auth/permission_helper.php` と `portal/api/*.php` が参照するテーブルを、議事録と同じ MySQL データベースに配置する。マイグレーション SQL は **platform-common 側**のみに置き、議事録アプリの PHP は変更しない。

## テーブルと役割

| テーブル | 用途 |
|----------|------|
| `projects` | プロジェクト（案件）の論理コンテナ。`project_members.project_id` の参照先。登録用に `client_name` / `site_type` / 日付などを保持。 |
| `project_renewal_urls` | リニューアル案件の対象 URL（`project_id` に複数行）。 |
| `project_redmine_links` | プロジェクトに紐づく Redmine プロジェクト ID（複数行）。 |
| `project_misc_links` | 案件の任意リンク（表示名 + URL、複数行）。 |
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
| [database/migrations/20260420_project_registration_fields.sql](../database/migrations/20260420_project_registration_fields.sql) | `projects` 拡張（クライアント・サイト種別・日付等）+ `project_renewal_urls` + `project_redmine_links` |
| [database/migrations/20260421_user_redmine_and_project_misc_links.sql](../database/migrations/20260421_user_redmine_and_project_misc_links.sql) | `users.redmine_base_url` / `redmine_api_key` + `project_misc_links` |

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

## `project_members` をメールで付与（手間削減）

個別の `.sql` を置かずに、Docker 内の mysql へ標準入力で流し込むスクリプトを使うと **`docker cp` やホストの mysql クライアントは不要**です。

| ファイル | 使い方（リポジトリルート想定） |
|----------|----------------|
| [database/scripts/grant-project-members.ps1](../database/scripts/grant-project-members.ps1) | `.\platform-common\database\scripts\grant-project-members.ps1 user1@example.com user2@example.com` |
| [database/scripts/grant-project-members.sh](../database/scripts/grant-project-members.sh) | `CONTAINER=minutes-db-dev ./platform-common/database/scripts/grant-project-members.sh user1@example.com` |

オプション（PowerShell は同名パラメータ、sh は主に環境変数）: `ProjectId` / `PROJECT_ID`（既定 `1`）、`Role` / `ROLE`（既定 `editor`）、`Container` / `CONTAINER`（既定 `minutes-db-dev`）、MySQL パスワードは `MYSQL_ROOT_PASSWORD` または `MYSQL_PASSWORD`（未設定時は開発用 `root`）。

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

`20260420_project_registration_fields.sql` 適用後の巻き戻し例は、同ファイル末尾のコメント（`project_redmine_links` → `project_renewal_urls` → `projects` の列削除）を参照。
