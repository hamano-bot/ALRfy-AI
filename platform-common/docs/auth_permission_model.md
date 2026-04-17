# platform-common 認証・権限モデル（フェーズ1）

テーブル定義・マイグレーション適用手順・シード方針は [acl_database.md](acl_database.md) を参照。

## 目的
- 認証入口を `platform-common` に一本化し、`minutes-record` と `project-manager` で同じユーザーID体系を使う。
- 画面表示とAPI認可の判定ルールを統一し、表示と実際の操作可否の不整合を防ぐ。

## 共通Googleログイン仕様
1. クライアントは `platform-common` のログインエンドポイントへ遷移する。
2. `platform-common` が Google OAuth 認証を実施する。
3. 認証成功後、`google_sub` で `users` を検索し、存在しなければ初期登録する。
4. サーバーはセッションを発行し、`user_sessions.session_token_hash` のみを保存する。
5. ログイン後遷移先は原則ダッシュボード。`direct_open_last_app=1` の場合は前回利用アプリへ遷移する。

## 未所属ユーザーの扱い
- `project_members` と `resource_members` のどちらにも所属がないユーザーは、業務画面へ遷移させない。
- 代わりに「権限申請」画面へ誘導する。

## ロール判定ルール
- 判定順序: `resource_members` -> `project_members` -> `no_access`
- 優先度: `owner > editor > viewer`
- 実効ロールは API と UI で同じヘルパー関数を利用して算出する。

## ロール別操作範囲
- `owner`: 権限付与/剥奪、設定変更、最終承認
- `editor`: コンテンツ作成・更新
- `viewer`: 閲覧のみ

## 監査要件
- 権限付与/剥奪/変更は必ず `resource_acl_logs` に記録する。
- ログには「実行者」「対象ユーザー」「対象リソース」「変更内容」「日時」を含める。
