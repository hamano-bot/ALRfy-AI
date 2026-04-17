# 3 API 実リクエスト確認シート（フェーズ1）

フロント実装着手前に、`GET /me`、`GET /apps`、`GET /projects/:id/permission` 相当APIの実リクエスト結果を確認するためのシート。

**開発サーバー**: `platform-common` で `php -S 0.0.0.0:8001 router.php` を使うと、下記の **拡張子なしURL** が有効（`router.php` 参照）。`-t` のみだと `.php` 直指定が必要。

## 実行用チェックリスト（このURL順で開く）

以下は「上から順にブラウザで開く」だけで、このシートを埋められる実行リスト。

### 事前に決める値
- `BASE_URL`: 例 `http://localhost:8000`
- `PROJECT_ID_ALLOWED`: 権限あり判定に使う `project_id`（例: `10`）
- `PROJECT_ID_FORBIDDEN`: 権限なし判定に使う `project_id`（例: `99`）
- `RESOURCE_TYPE`: 例 `meeting`
- `RESOURCE_ID`: 例 `123`

### A. 未ログイン（401確認）
シークレットウィンドウで実行（ログインしない）。

1. `{{BASE_URL}}/portal/api/me`
2. `{{BASE_URL}}/portal/api/apps`
3. `{{BASE_URL}}/portal/api/project-permission?project_id={{PROJECT_ID_ALLOWED}}`

### B. 所属あり・権限ありユーザー（200確認）
通常ウィンドウで「所属あり・権限ありユーザー」でログインして実行。

4. `{{BASE_URL}}/portal/api/me`
5. `{{BASE_URL}}/portal/api/apps`
6. `{{BASE_URL}}/portal/api/project-permission?project_id={{PROJECT_ID_ALLOWED}}`
7. `{{BASE_URL}}/portal/api/project-permission?project_id={{PROJECT_ID_ALLOWED}}&resource_type={{RESOURCE_TYPE}}&resource_id={{RESOURCE_ID}}`

### C. 所属あり・対象project権限なしユーザー（403確認）
同じ通常ウィンドウでログアウトし、「所属あり・対象project権限なしユーザー」で再ログインして実行。

8. `{{BASE_URL}}/portal/api/project-permission?project_id={{PROJECT_ID_FORBIDDEN}}`

### D. 所属なしユーザー（409確認）
同じ通常ウィンドウでログアウトし、「所属なしユーザー」で再ログインして実行。

9. `{{BASE_URL}}/portal/api/me`
10. `{{BASE_URL}}/portal/api/apps`
11. `{{BASE_URL}}/portal/api/project-permission?project_id={{PROJECT_ID_ALLOWED}}`

### E. permission API バリデーション（400確認）
任意の「ログイン済みユーザー」で実行。

12. `{{BASE_URL}}/portal/api/project-permission`
13. `{{BASE_URL}}/portal/api/project-permission?project_id=0`
14. `{{BASE_URL}}/portal/api/project-permission?project_id={{PROJECT_ID_ALLOWED}}&resource_type={{RESOURCE_TYPE}}`
15. `{{BASE_URL}}/portal/api/project-permission?project_id={{PROJECT_ID_ALLOWED}}&resource_id={{RESOURCE_ID}}`
16. `{{BASE_URL}}/portal/api/project-permission?project_id={{PROJECT_ID_ALLOWED}}&resource_type={{RESOURCE_TYPE}}&resource_id=0`

### 実行メモ（置換後）
- BASE_URL:
- PROJECT_ID_ALLOWED:
- PROJECT_ID_FORBIDDEN:
- RESOURCE_TYPE:
- RESOURCE_ID:

## 0. 事前準備
- [ ] ログイン済みセッションあり（`401` 以外の確認時）
- [ ] 所属ありユーザーと所属なしユーザーの2パターンを用意
- [ ] 権限なしユーザー（対象プロジェクトに `no_access` になるユーザー）を用意
- [ ] テスト対象の `project_id` / `resource_type` / `resource_id` を決定

## 1. GET /me
- エンドポイント: `/portal/api/me`（実装ファイル `portal/api/get_me.php`）

### 1-1. 200 success（所属あり）
- [ ] ステータスコード: `200`
- [ ] `success` が `true`
- [ ] `user.id` / `user.email` / `user.display_name` / `user.theme` が返る
- [ ] `roles_summary.global` が返る
- [ ] `roles_summary.projects` が配列で返る
- [ ] `available_apps` が配列で返る

### 1-2. 401 unauthorized（未ログイン）
- [ ] ステータスコード: `401`
- [ ] `success` が `false`
- [ ] メッセージが「ログインが必要です。」

### 1-3. 409 unassigned_user（所属なし）
- [ ] ステータスコード: `409`
- [ ] `success` が `false`
- [ ] `code` が `unassigned_user`

## 2. GET /apps
- エンドポイント: `/portal/api/apps`（実装ファイル `portal/api/get_apps.php`）

### 2-1. 200 success（所属あり）
- [ ] ステータスコード: `200`
- [ ] `success` が `true`
- [ ] `apps` が配列で返る
- [ ] 各要素に `app_key` / `title` / `route` / `required_role` / `visibility` がある
- [ ] `visibility=visible_disabled` のとき `reason=insufficient_role` が返る

### 2-2. 401 unauthorized（未ログイン）
- [ ] ステータスコード: `401`
- [ ] `success` が `false`

### 2-3. 409 unassigned_user（所属なし）
- [ ] ステータスコード: `409`
- [ ] `success` が `false`
- [ ] `code` が `unassigned_user`

## 3. GET /projects/:id/permission
- 実装エンドポイント: `/portal/api/project-permission`（実装ファイル `portal/api/get_project_permission.php`）
- 必須クエリ: `project_id=<number>`
- 任意クエリ: `resource_type=<string>&resource_id=<number>`（セット指定）

### 3-1. 200 success（アクセス権あり）
- [ ] ステータスコード: `200`
- [ ] `success` が `true`
- [ ] `project_id` が一致
- [ ] `effective_role` が `owner|editor|viewer` のいずれか
- [ ] `source` が `resource_members|project_members` のいずれか
- [ ] `candidates.project_role` / `candidates.resource_role` が返る

### 3-2. 401 unauthorized（未ログイン）
- [ ] ステータスコード: `401`
- [ ] `success` が `false`

### 3-3. 403 forbidden（アクセス権なし）
- [ ] ステータスコード: `403`
- [ ] `success` が `false`
- [ ] `effective_role` が `no_access`

### 3-4. 409 unassigned_user（所属なし）
- [ ] ステータスコード: `409`
- [ ] `success` が `false`
- [ ] `code` が `unassigned_user`

## 4. パラメータバリデーション確認（permission API）
- [ ] `project_id` 未指定で `400`
- [ ] `project_id<=0` で `400`
- [ ] `resource_type` のみ指定で `400`
- [ ] `resource_id` のみ指定で `400`
- [ ] `resource_id<=0` で `400`

## 5. 実行メモ（貼り付け欄）
- 実行日:
- 実行者:
- 200確認済みユーザー:
- 403確認済みユーザー:
- 409確認済みユーザー:
- 備考:
