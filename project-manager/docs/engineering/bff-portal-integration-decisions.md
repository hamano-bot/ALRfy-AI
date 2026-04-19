# BFF 採用とポータル連携 — 決定事項・未決定チェックリスト

## 確定した方針

| 項目 | 決定内容 |
|------|-----------|
| **アーキテクチャ** | **Backend for Frontend（BFF）** を採用する。 |
| **理由** | **案件管理の Web アプリ**（`project-manager/apps/web`、開発時は例としてポート `8001`）と **`platform-common` の PHP**（別ポート）の **オリジン分離**が続くため、ブラウザから PHP を **直接 fetch しない**（CORS・Cookie の負担を BFF に集約）。 |
| **PHP 側の正** | アプリ一覧は契約どおり **`GET /portal/api/apps`**（実装: `portal/api/get_apps.php`、`router.php` で拡張子なし）。参照: [platform-common/docs/api_contracts.md](../../../platform-common/docs/api_contracts.md)。 |

---

## 早めに決めておくとよいこと（優先度順）

### 1. BFF の URL と実装場所（案件管理 Web アプリ）

| 論点 | 候補・メモ |
|------|------------|
| **パス** | 例: `GET /api/portal/apps`（一覧）、必要なら `GET /api/portal/me` など。REST 的に **名詞・複数形**で揃える。 |
| **実装** | App Router の **Route Handler**（例: `app/api/portal/apps/route.ts`）。 |
| **HTTP メソッド** | PHP が `GET` のみなら BFF も **GET のみ**で透過。 |

### 2. サーバー専用環境変数（ブラウザに出さない）

| 論点 | メモ |
|------|------|
| **PHP のベース URL** | 例: `PORTAL_API_BASE_URL=http://127.0.0.1:XXXX`（**末尾スラッシュなし**推奨）。**`NEXT_PUBLIC_` は付けない**（ビルドに埋め込まれクライアントに漏れる）。 |
| **本番・ステージング** | コンテナ内から PHP へは **内部 DNS / localhost / サービス名** で到達する想定をドキュメント化。 |
| **プロフィール（`/me`）** | **実装済み:** クライアントは **`GET /api/portal/me`** のみ（`credentials: 'include'`）。BFF が **`PORTAL_API_BASE_URL` + `/portal/api/me`** へ Cookie 転送。`NEXT_PUBLIC_PROFILE_API_ENDPOINT` は **廃止**（`.env.example` から削除）。 |

### 3. 認証・Cookie の渡し方（最重要）

| 論点 | 候補 |
|------|------|
| **A. Cookie ヘッダ転送** | ブラウザ → BFF のリクエストに付いた **`Cookie` を BFF → PHP にそのまま付与**する。PHP は既存どおり `$_SESSION`。**同一ログイン体系を保ちやすい**。 |
| **B. 別トークン** | セッションを BFF で検証し、PHP 用に別ヘッダーを付ける。**PHP 改修が増える**ことが多い。 |

**推奨（現状の platform-common 前提）:** まず **A（Cookie 転送）** を第一候補とし、**`credentials: 'include'`** でクライアントが BFF を叩く。

### 4. BFF のレスポンス契約（フロント向け）

| 論点 | メモ |
|------|------|
| **PHP の JSON をそのまま返すか** | そのまま返すなら型は [api_contracts.md](../../../platform-common/docs/api_contracts.md) に合わせる。 |
| **エラー整形** | PHP の `401` / `409` / `500` を BFF で **フロントが扱いやすい JSON**（`code`, `message`）にマッピングするか決める。 |
| **タイムアウト** | `AbortSignal` / `fetch` の上限（例: 10s）を決める。 |

### 5. クライアントの呼び方（ダッシュボード・シェル）

| 論点 | メモ |
|------|------|
| **URL** | 相対パス `fetch('/api/portal/apps', { credentials: 'include' })` で **同一オリジン（案件管理 Web アプリのオリジン）** のみ。 |
| **Server Component vs Client** | 初回表示を **RSC で BFF にサーバー fetch** するか、`DashboardShell` 内で **useEffect** するか。UX・キャッシュ方針で選択。 |
| **サイドメニューとカードのデータ源** | **同じ BFF レスポンス**（または同じ hooks）から生成し、プランどおり **表示ロジックの二重実装を避ける**。 |

### 6. キャッシュ・再検証

| 論点 | メモ |
|------|------|
| **GET /apps のキャッシュ** | 初回は `no-store` で素直に、負荷が出たら **短 TTL** やタグ付き再検証を検討。 |
| **BFF 内 upstream `fetch` のキャッシュ** | Route Handler 内の上流 `fetch` に `cache: 'no-store'` を付けるか明示。 |

### 7. セキュリティ・運用

| 論点 | メモ |
|------|------|
| **SSRF** | BFF が読む URL は **環境変数のベース URL + 固定パス**に限定し、**クエリで任意 URL を指定できない**ようにする。 |
| **ログ** | 上流のエラーボディをそのままクライアントに返さないか、**PII をマスク**する方針。 |
| **レート制限** | 必要なら BFF またはインフラ（WAF / API GW）で検討。 |

### 8. 開発・デプロイ

| 論点 | メモ |
|------|------|
| **ローカル** | **案件管理 Web と PHP は別ポート**（例: Web `3000` または LAN 用 `8001`、PHP **`127.0.0.1:8000`**）。PHP は `platform-common` で [`dev-router.ps1`](../../../platform-common/dev-router.ps1)（PowerShell）または [`dev-router.sh`](../../../platform-common/dev-router.sh)（`php -S … router.php` と同等）を推奨。`project-manager/apps/web/.env.local` の `PORTAL_API_BASE_URL` をその PHP のオリジンに合わせ、**案件管理 Web の開発サーバ**から到達できるか確認する（ファイアウォール・バインド）。 |
| **本番** | 案件管理 Web と PHP が **同一 VPC / 内部 URL** で通信できるネットワーク設計。 |

### 9. 実効ロール表示を **`GET /projects/:id/permission`**（PHP: `GET /portal/api/project-permission?project_id=…`）に寄せる場合

**採用理由の例:** 契約どおり **`effective_role` / `source` / `candidates`** が揃い、**1 プロジェクト文脈**の権限を `resolveEffectiveRole()` と一致させられる。

この API を「正」にするとき、**別途決めること**（チェックリスト）:

**決定（初期実装・2026-04）:** **`project_id` の出所**は次の優先順とする。（1）URL クエリ **`?project_id=`**（2）未指定時のみ、任意の **`NEXT_PUBLIC_DEFAULT_PROJECT_ID`**（開発・デモ用。本番では未設定可）（3）いずれも無い場合は **実効ロール1行を表示しない**。将来は `user_preferences` の既定案件などへ拡張する。

| 論点 | 決める内容 |
|------|------------|
| **`project_id` の出所** | 上記 **決定（初期実装）** を正とする。追加で (d) Project一覧以降のみ表示 等へ拡張する場合は本表を更新する。 |
| **リソース単位か** | 任意クエリ `resource_type` + `resource_id` を **ダッシュボードでは付けない**（プロジェクト単位のみ）か、ドキュメント詳細などでは付けるか。 |
| **BFF** | ブラウザは **`/api/portal/project-permission?project_id=…`** のように **同一オリジン**のみ。Route Handler は **`PORTAL_API_BASE_URL` + 固定パス**（例: `/portal/api/project-permission`）へ **`Cookie` 転送**。**`project_id` はサーバー側で正の整数に限定**（SSRF 防止・既存方針と同型）。 |
| **文言・ラベル** | 「実効ロール」とだけ書くと、**全案件の最大ロール**と誤解されうる。**例:** 「**案件 {name} での実効ロール: editor**」のように **対象プロジェクトを明示**。 |
| **エラー時 UI** | **401**（未ログイン）、**400**（`project_id` 不正）、**403**（その案件に `no_access`）、**409**（`unassigned_user`）、**500** — それぞれヘッダー／トーストで何を出すか。 |
| **`GET /apps` との関係** | `portal/includes/portal_apps_service.php` の **`effective_role` は「全 `project_members` のロールの最大」**でアプリ可視性に使っている。一方 **`get_project_permission.php` は指定 `project_id` の `resolveEffectiveRole`**。**案件Aでは viewer だが、別案件で owner なのでアプリは有効**のように、**数値が一致しないことがある**。表示を分ける（「アプリ表示に使っているロール」vs「この案件でのロール」）か、将来バックエンドで揃えるかを文書または UI で明示する。 |
| **PHP `dashboard.php` との揃え** | **`dashboard.php`（2026-04 更新）:** 常時ピルは **「アプリ表示ロール（全案件の最大）」** と明示（`GET /apps` と同基準、`title` で補足）。任意クエリ **`?project_id=`** があるとき、**`resolveEffectiveRole`（`GET /portal/api/project-permission` と同基準）** の結果を **2つ目のピル**で表示（案件名は `projects.name`）。 |

---

## 実装順の提案

1. `PORTAL_API_BASE_URL`（サーバー専用）を `.env.example` にコメント例で追記し、README に一行説明。  
2. `app/api/portal/apps/route.ts` を追加し、`Cookie` 転送で PHP の `/portal/api/apps` をプロキシ。  
3. `page.tsx` または `DashboardShell` から BFF を `credentials: 'include'` で呼び、**カード UI** を追加。  
4. 左サイドの `navItems` を **同データ**で生成（または共通フック）。  
5. **`GET /api/portal/me` BFF**（上流 `/portal/api/me`）+ ダッシュボードの表示名・テーマ初期同期。**完了**（`app/api/portal/me/route.ts`、`DashboardShell`）。

---

## 関連ファイル（現状）

| パス | 役割 |
|------|------|
| [platform-common/portal/api/get_apps.php](../../../platform-common/portal/api/get_apps.php) | アプリ一覧 API。 |
| [platform-common/portal/api/get_my_projects.php](../../../platform-common/portal/api/get_my_projects.php) | ログインユーザー所属 Project 一覧 API（`GET /portal/api/my-projects`）。 |
| [platform-common/router.php](../../../platform-common/router.php) | `/portal/api/*` ルーティング（`apps` / `me` / `project-permission` / `my-projects`）。 |
| [project-manager/apps/web/app/components/DashboardShell.tsx](../../apps/web/app/components/DashboardShell.tsx) | 表示名・テーマは **`GET /api/portal/me`** を `credentials: 'include'` で取得。 |
| [project-manager/apps/web/app/api/portal/project-permission/route.ts](../../apps/web/app/api/portal/project-permission/route.ts) | 案件単位実効ロール BFF（上流 `/portal/api/project-permission`）。 |
| [project-manager/apps/web/app/api/portal/me/route.ts](../../apps/web/app/api/portal/me/route.ts) | ログインユーザー概要 BFF（上流 `/portal/api/me`）。 |
| [project-manager/apps/web/app/api/portal/my-projects/route.ts](../../apps/web/app/api/portal/my-projects/route.ts) | 所属 Project 一覧 BFF（上流 `/portal/api/my-projects`）。 |
| [project-manager/apps/web/app/components/EffectiveProjectRoleBanner.tsx](../../apps/web/app/components/EffectiveProjectRoleBanner.tsx) | `project_id` 解決（`window.location.search` + `usePathname`）+ BFF 取得 + ヘッダー直下1行表示。 |
| [project-manager/apps/web/lib/portal-project-permission.ts](../../apps/web/lib/portal-project-permission.ts) | 詳細 RSC 用: 上流 `GET /portal/api/project-permission` を Cookie 付きで取得（帯と同一契約）。 |
| [project-manager/apps/web/app/project-list/[projectId]/ProjectDetailView.tsx](../../apps/web/app/project-list/[projectId]/ProjectDetailView.tsx) | 案件メタ（`my-projects` 行）+ 実効ロール（`project-permission`）+ ドキュメントルート案。 |

---

## 更新履歴

- 初版: BFF 採用決定と、ポート分離前提で先に決めたい論点を一覧化。
- 追記: 実効ロールを **`GET /portal/api/project-permission`** 基準にする場合の決定チェックリスト（`project_id` 出所、BFF、文言、`GET /apps` 側の `effective_role` との差）。
- 用語: フレームワーク略称に頼らず、**案件管理 Web アプリ**（`project-manager/apps/web`）と **platform-common（PHP）** で区別するように整理。
- 追記: §9 **`project_id` 出所の初期実装決定**（クエリ優先 → 任意 `NEXT_PUBLIC_DEFAULT_PROJECT_ID` → なければ非表示）。
- 追記: **`GET /api/portal/me` BFF**（`NEXT_PUBLIC_PROFILE_API_ENDPOINT` 廃止、クライアントは同一オリジンのみ）。
- 追記: **`dashboard.php`** — アプリ用ロールと案件単位の **ラベル分け** + 任意 **`?project_id=`** で `project-permission` 同基準の2つ目ピル。
- 追記: **`GET /portal/api/my-projects`** + BFF **`/api/portal/my-projects`** + **`/project-list`** 一覧（Server Component）。
- 追記: **`/project-list/[projectId]`** — RSC で **`my-projects` + `project-permission`** 並列取得、ドキュメント用ルート案をページ内に記載。
