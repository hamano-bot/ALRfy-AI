# Auth/Permission API 契約（フェーズ1）

## GET /me
ログインユーザーの基本情報と利用可能範囲を返す。

- 任意クエリ: `unassigned_ok=1` — `project_members` に行がなくても **200** でユーザー情報と `redmine` を返す（案件新規登録 UI 用）。指定なしのときは従来どおり未所属は **409**。

### response (200)
```json
{
  "success": true,
  "user": {
    "id": 101,
    "email": "user@example.com",
    "display_name": "Example User",
    "theme": "system"
  },
  "roles_summary": {
    "global": "viewer",
    "projects": [
      { "project_id": 10, "role": "editor" }
    ]
  },
  "available_apps": [
    {
      "app_key": "minutes-record",
      "visibility": "visible_enabled"
    },
    {
      "app_key": "project-manager",
      "visibility": "visible_disabled"
    }
  ],
  "redmine": {
    "configured": true,
    "base_url": "https://redmine.example.com"
  }
}
```

`redmine.configured` は `users.redmine_base_url` と `users.redmine_api_key` がともに非空のとき `true`。生の API キーは返さない。

## POST /user/redmine（Redmine URL・API キー保存）

- 公開URL: `POST /portal/api/user/redmine`
- 実装: `portal/api/patch_user_redmine.php`
- ログイン必須。JSON: `redmine_base_url`（null 可）、`redmine_api_key`（省略時はキー列を更新しない。null でクリア）。

## POST /user/redmine/test（接続テスト）

- 公開URL: `POST /portal/api/user/redmine/test`
- 実装: `portal/api/post_user_redmine_test.php`
- 本文に URL/キーを渡すか、DB の保存済み値で `GET /projects.json?limit=1` を試行。

## GET /redmine-project-suggest

- 公開URL: `GET /portal/api/redmine-project-suggest?q=...`
- 実装: `portal/api/get_redmine_project_suggest.php`
- セッション・API キー必須。スペース区切り AND でプロジェクト一覧を絞り込み。

## GET /apps
ダッシュボードカード/サイドメニュー描画用の評価済みアプリ一覧を返す。

### response (200)
```json
{
  "success": true,
  "apps": [
    {
      "app_key": "minutes-record",
      "title": "議事録アプリ",
      "route": "/minutes",
      "required_role": "viewer",
      "visibility": "visible_enabled",
      "reason": null
    },
    {
      "app_key": "project-manager",
      "title": "案件管理",
      "route": "/project-list",
      "required_role": "editor",
      "visibility": "visible_disabled",
      "reason": "insufficient_role"
    }
  ]
}
```

## GET /my-projects（案件管理 Web 一覧用）
ログインユーザーが `project_members` 経由で所属する案件の一覧を返す。

### request
- 公開URL（開発時 `router.php` 利用時）: `GET /portal/api/my-projects`
- 実装ファイル: `portal/api/get_my_projects.php`

### response (200)
```json
{
  "success": true,
  "projects": [
    {
      "id": 10,
      "name": "サンプル案件",
      "slug": "sample",
      "role": "editor",
      "client_name": "ACME 株式会社",
      "site_type": "corporate",
      "site_type_other": null,
      "is_renewal": false,
      "kickoff_date": "2026-04-01",
      "release_due_date": null
    }
  ]
}
```

`slug` は未設定時 `null`。`client_name` / `site_type` / 日付などはマイグレーション [`20260420_project_registration_fields.sql`](../database/migrations/20260420_project_registration_fields.sql) 適用後に返る（未適用の DB では一覧取得が 500 になる）。`409` / `401` は他 API と同様。

### 案件管理 Web（Next BFF）

| ポータル（PHP） | Next（プロキシ） |
|-----------------|------------------|
| `GET /portal/api/my-projects` | `GET /api/portal/my-projects`（Cookie 転送） |
| `GET /portal/api/project?project_id=` | `GET /api/portal/project?project_id=`（Cookie 転送） |
| `PATCH /portal/api/project` | `PATCH /api/portal/project`（JSON を Zod で検証のうえ転送） |
| `POST /portal/api/projects` | `POST /api/portal/projects`（JSON ボディを Zod で検証のうえ転送） |
| `GET /portal/api/project-hearing-sheet?project_id=` | `GET /api/portal/project-hearing-sheet?project_id=`（Cookie 転送） |
| `PATCH /portal/api/project-hearing-sheet` | `PATCH /api/portal/project-hearing-sheet`（JSON を Zod で検証のうえ転送） |

## GET /project-hearing-sheet（案件のヒアリングシート）

`project_hearing_sheets` に 1:1 で保存する **ヒアリングシート**（`body_json` + `status`）。行が無い場合は `draft` と空の `body_json` を返す（DB には挿入しない）。

### request
- 公開URL: `GET /portal/api/project-hearing-sheet?project_id=<int>`
- 実装ファイル: `portal/api/get_patch_project_hearing_sheet.php`（GET）
- **認可:** ログイン必須。**当該 `project_id` の `project_members` に行があること**（なければ `403`）。

### response (200)
```json
{
  "success": true,
  "hearing_sheet": {
    "project_id": 4,
    "status": "draft",
    "body_json": []
  }
}
```

`body_json` は空のとき JSON 配列 `[]` になる場合があります（PHP のデコード結果）。

## PATCH /project-hearing-sheet（ヒアリングシートの作成・更新）

### request
- 公開URL: `PATCH /portal/api/project-hearing-sheet`
- 実装ファイル: `portal/api/get_patch_project_hearing_sheet.php`（PATCH）
- Next BFF: `PATCH /api/portal/project-hearing-sheet`（`portalProjectHearingSheetPatchBodySchema`）
- **認可:** `owner` または `editor`。`viewer` は `403`。
- **body:** `project_id`（必須）。**`body_json` と `status` の少なくとも一方**（両方可）。`body_json` は JSON オブジェクトまたは配列（最大約 2 MiB）。

初回は行が無ければ `INSERT`、あれば `UPDATE`。

## GET /project（単一案件の登録内容）

所属メンバー向けに、`projects` と関連テーブル（リニューアル URL・Redmine・任意リンク・参加者）を集約して返す。

### request
- 公開URL: `GET /portal/api/project?project_id=<int>`
- 実装ファイル: `portal/api/get_patch_project.php`（GET）
- **認可:** ログイン必須。**当該 `project_id` の `project_members` に行があること**（なければ `403`）。

### response (200)
```json
{
  "success": true,
  "project": {
    "id": 4,
    "name": "案件名",
    "slug": "project-slug",
    "client_name": null,
    "site_type": "corporate",
    "site_type_other": null,
    "is_renewal": false,
    "kickoff_date": "2026-04-01",
    "release_due_date": null,
    "renewal_urls": ["https://example.com/old"],
    "redmine_links": [{ "redmine_project_id": 1, "redmine_base_url": null }],
    "misc_links": [{ "label": "Wiki", "url": "https://..." }],
    "participants": [{ "user_id": 10, "role": "owner", "display_name": "user@example.com" }]
  }
}
```

`display_name` は現状 `users.email` を用いる場合がある。

## PATCH /project（単一案件の更新）

### request
- 公開URL: `PATCH /portal/api/project`
- 実装ファイル: `portal/api/get_patch_project.php`（PATCH）
- `Content-Type: application/json`
- **認可:** ログイン必須。**当該案件の `project_members.role` が `owner` または `editor`**。`viewer` は `403`。
- **body:** `project_id`（必須）に加え、POST `/portal/api/projects` と**同じフィールド**（`name` … `participants`）を送る。**`slug` はサーバーが更新しない**（名前変更時も据え置き）。

### response (200)
GET と同形の `success` + `project`。

### エラー
- `400` / `401` / `403` / `404` / `500` — バリデーション・権限・未検出・DB

## POST /projects（案件の新規作成）

ログイン済みユーザーがプロジェクトを 1 件作成する。セッションのユーザーが `project_members` に **`owner`** として登録され、任意の参加者を `editor` / `viewer` で追加できる。

### request

- 公開URL（開発時 `router.php` 利用時）: `POST /portal/api/projects`
- 実装ファイル: `portal/api/post_projects.php`
- Next BFF: `POST /api/portal/projects`（`project-manager/apps/web`、環境変数 `PORTAL_API_BASE_URL`）
- `Content-Type: application/json`
- **認可:** ログイン必須。**未所属ユーザー**（`project_members` にまだ行がない）でも作成可能（最初の案件を作るため）。作成可否の追加ポリシーは将来拡張。

### body（JSON）

| フィールド | 必須 | 説明 |
|------------|------|------|
| `name` | はい | プロジェクト名（255 文字以内）。`slug` はサーバーが `name` から生成し、重複時はサフィックスを付与。 |
| `client_name` | いいえ | クライアント名（255 文字以内）または `null`。 |
| `site_type` | いいえ | `corporate` / `ec` / `member_portal` / `internal_portal` / `owned_media` / `product_portal` / `other` または `null`。 |
| `site_type_other` | 条件付き | `site_type` が `other` のとき必須（空でない文字列）。それ以外は無視され `null` 扱い。 |
| `is_renewal` | いいえ | 既定 `false`。 |
| `renewal_urls` | いいえ | 文字列 URL の配列。`is_renewal` が `false` のときは無視（保存されない）。 |
| `kickoff_date` | いいえ | `YYYY-MM-DD` または `null`。 |
| `release_due_date` | いいえ | `YYYY-MM-DD` または `null`。 |
| `redmine_links` | いいえ | Redmine プロジェクト ID の配列。要素は **正の整数**、または `{ "redmine_project_id": <int>, "redmine_base_url": "<string|null>" }`。同一 ID の重複は 1 行にまとめる。 |
| `misc_links` | いいえ | `{ "label": "<string>", "url": "<string>" }` の配列（`project_misc_links` に保存）。 |
| `participants` | いいえ | `{ "user_id": <int>, "role": "editor" \| "viewer" }` の配列。同一 `user_id` が複数回ある場合は **editor を優先**。作成者（セッションユーザー）と同一 ID は無視（作成者は `owner` のみ）。参照先 `users.id` が存在すること。 |

### response (201 Created)

```json
{
  "success": true,
  "project": {
    "id": 42,
    "name": "新規案件",
    "slug": "new-project",
    "client_name": "ACME 株式会社",
    "site_type": "corporate",
    "site_type_other": null,
    "is_renewal": false,
    "kickoff_date": "2026-05-01",
    "release_due_date": null
  }
}
```

### エラー

- `400` — バリデーション失敗（JSON・必須・形式・存在しない `user_id` 等）
- `401` — 未ログイン
- `403` — セッションのユーザーが `users` に存在しない
- `500` — DB エラー（マイグレーション未適用の列不足など）

## GET /projects/:id/permission
指定プロジェクトに対する実効ロールと判定根拠を返す。

### request
- 公開URL（開発時 `router.php` 利用時）: `GET /portal/api/project-permission`
- 実装ファイル: `portal/api/get_project_permission.php`
- 必須クエリ: `project_id=<number>`
- 任意クエリ: `resource_type=<string>&resource_id=<number>`（セット指定）

### response (200)
```json
{
  "success": true,
  "project_id": 10,
  "effective_role": "editor",
  "source": "resource_members",
  "candidates": {
    "resource_role": "editor",
    "project_role": "viewer"
  }
}
```

## 共通エラー
- `401 unauthorized`: セッションなし/期限切れ
- `403 forbidden`: 認証済みだが権限不足
- `409 unassigned_user`: 認証済みだが所属先が存在しない

### response (409)
```json
{
  "success": false,
  "message": "所属先が未設定のため利用できません。",
  "code": "unassigned_user"
}
```
