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
- クエリ（任意）:
  - `page_size`: 1〜100 の整数を指定すると **ページング**有効。未指定または範囲外は **全件**（従来どおり）。
  - `page`: ページ番号（1 始まり）。`page_size` 指定時のみ有効。省略時は `1`。

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

ページング時（`page_size` 有効）は上記に加えて `total`（条件に一致する総件数）、`page`、`page_size` が付与される。

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
| `GET /portal/api/hearing-insight-batch-state` | **Cron 専用**（`X-Cron-Secret`）。最終 insight バッチ時刻 |
| `PATCH /portal/api/hearing-insight-batch-state` | **Cron 専用**。`{ "last_run_at": "Y-m-d H:i:s" }` |
| `GET /portal/api/hearing-insight-export?template_id=&since=` | **Cron 専用**。解析行デルタ（シート更新が `since` より後の案件のみ） |
| `GET /portal/api/hearing-template-definition?template_id=` | **Cron 専用**。DB の公開テンプレ `items_json` |
| `PATCH /portal/api/patch-hearing-template-definition` | **Cron 専用**。テンプレ定義更新 + `system_update_events` へ記録 |
| `GET /portal/api/system-update-events` | ログイン必須。テンプレ自動更新などのイベント一覧 |
| （Next のみ）`GET /api/system-updates` | 静的 `updates.json` とポータル `system-update-events` をマージ |
| （Next のみ）`POST /api/cron/hearing-template-insight` | **Cron 専用**。全 `template_id` に対し Gemini マージ→ポータル PATCH→`last_run_at` 更新 |

詳細は [`project-manager/docs/hearing-insight-guardrails.md`](../../project-manager/docs/hearing-insight-guardrails.md)。

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
- Next BFF: `PATCH /api/portal/project-hearing-sheet`（`portalProjectHearingSheetPatchBodySchema`）。**`body_json` 指定時は** `template_id`（`corporate_new` / `corporate_renewal` / `ec_new` / `ec_renewal` / `generic_new` / `generic_renewal`）と `items`（行配列・最大 500 行）を **Zod** で検証してから PHP に転送する。
- **認可:** `owner` または `editor`。`viewer` は `403`。
- **body:** `project_id`（必須）。**`body_json` と `status` の少なくとも一方**（両方可）。PHP 直叩き時は従来どおり緩いが、**案件管理 Web 経由では**上記スキーマに合わせる。

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

## 補足: project-manager（Next.js のみ・PHP 外）

### POST /api/hearing-sheet/import-excel

- **実装:** `project-manager/apps/web/app/api/hearing-sheet/import-excel/route.ts`
- **用途:** `.xlsx` / `.xls` の**先頭シート**をテキスト化し、**Gemini** で `template_id` + `items` にマッピング（環境変数 `GEMINI_API_KEY`）。取り込み対象は **Excel のみ**（PDF アップロードは行わない）。
- **multipart:** `file`（必須）、`template_id`（`corporate_new` 等の列挙値）
- **response (200):** `{ "success": true, "body_json": { "template_id", "items" }, "meta": { "sheetName", "text_truncated" } }`
- マージ（置換 / 空欄のみ / 追加のみ）は **クライアント**で実施し、その後 `PATCH /api/portal/project-hearing-sheet` で保存する。

### POST /api/hearing-sheet/advice

- **実装:** `project-manager/apps/web/app/api/hearing-sheet/advice/route.ts`
- **用途:** 現在の **案件マスタ**（`project`）とヒアリング **`items`（行）** を渡し、**Gemini** で「未入力の必須っぽい行」「マスタと矛盾しそうな記述」などの指摘を返す（環境変数 `GEMINI_API_KEY`、任意 `GEMINI_MODEL`。未指定時は `gemini-3-flash-preview` など実装の既定値）。
- **JSON:** `project`（`name`, `client_name`, `site_type`, `site_type_other`, `is_renewal`, `kickoff_date`, `release_due_date`, `renewal_urls`）、`template_id`（`corporate_new` 等）、`items`（行オブジェクトの配列・最大 500）
- **response (200):** `{ "success": true, "suggestions": [ { "kind", "message", "row_id?", "heading?" }, ... ] }`（最大 30 件）
- **response (502):** モデル失敗など `{ "success": false, "message": "..." }`
- UI では `row_id` または **見出し**で行をハイライト・スクロールしやすくする想定。
