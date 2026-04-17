# Auth/Permission API 契約（フェーズ1）

## GET /me
ログインユーザーの基本情報と利用可能範囲を返す。

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
  ]
}
```

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
      "route": "/projects",
      "required_role": "editor",
      "visibility": "visible_disabled",
      "reason": "insufficient_role"
    }
  ]
}
```

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
