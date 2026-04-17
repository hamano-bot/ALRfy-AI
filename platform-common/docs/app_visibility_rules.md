# アプリカード表示可否ルール

## 判定入力
- `apps.is_active`
- `app_access_policies.required_role`
- ユーザー実効ロール（`owner` / `editor` / `viewer` / `no_access`）
- アプリごとの秘匿方針（show_disabled or hide_if_forbidden）

## 判定結果
- `visible_enabled`: 表示・クリック可
- `visible_disabled`: 表示・クリック不可
- `hidden`: 非表示

## 判定順序
1. `apps.is_active = 0` の場合は `hidden`
2. 必要ロールを満たす場合は `visible_enabled`
3. 必要ロールを満たさない場合:
   - 秘匿方針が `show_disabled` なら `visible_disabled`
   - 秘匿方針が `hide_if_forbidden` なら `hidden`

## 重要ルール
- ダッシュボードカードとサイドメニューは必ず同じ判定結果を使う。
- 各画面で個別条件を書かず、`GET /apps` の結果だけを描画根拠にする。
