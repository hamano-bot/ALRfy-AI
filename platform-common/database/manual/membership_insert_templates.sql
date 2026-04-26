-- ============================================================
-- 手動運用: project_members / resource_members を DB から付与する
--
-- 前提:
--   - migrations/20260417_platform_acl_and_apps.sql 適用済み
--   - 対象 DB: alrfy_ai_db_dev（議事録と共有）
--   - role は permission_helper.php と一致: owner | editor | viewer
--
-- 使い方:
--   1) 下の「参照用 SELECT」で user_id / project_id を確認
--   2) テンプレートのプレースホルダを実値に置き換えて実行
--   3) hasAnyMembership: project_members または resource_members の
--      いずれかに 1 行でもあれば GET /portal/api/me は未所属でない
--   4) 案件単位の API 認可は通常 project_members を参照
--
-- Windows / PowerShell でファイルを流し込む場合は UTF-8 と改行に注意。
-- コメントが化ける場合は docker cp + mysql < /tmp/... と同様の手順を推奨。
--
-- メールで project_members だけ付与する頻繁な運用は ../scripts/grant-project-members.ps1（または .sh）を参照。
-- ============================================================

USE `alrfy_ai_db_dev`;

-- ------------------------------------------------------------
-- 参照用 SELECT（実行前の確認）
-- ------------------------------------------------------------

-- メールアドレスから users.id
-- SELECT `id`, `email` FROM `users` WHERE `email` = 'user@example.com' LIMIT 1;

-- 案件一覧（project_members.project_id の参照先）
-- SELECT `id`, `name`, `slug` FROM `projects` ORDER BY `id`;

-- 既存のプロジェクト所属
-- SELECT pm.`project_id`, p.`name`, pm.`user_id`, u.`email`, pm.`role`
-- FROM `project_members` pm
-- JOIN `projects` p ON p.`id` = pm.`project_id`
-- JOIN `users` u ON u.`id` = pm.`user_id`
-- WHERE pm.`user_id` = 1
-- ORDER BY pm.`project_id`;

-- 既存のリソース付与
-- SELECT * FROM `resource_members` WHERE `user_id` = 1;

-- ------------------------------------------------------------
-- project_members: 1 ユーザー × 1 案件 にロールを付与（推奨）
-- ------------------------------------------------------------
-- 同一 (project_id, user_id) は UNIQUE のため、再実行でロールを更新したい場合は
-- ON DUPLICATE KEY UPDATE を使う。

-- INSERT INTO `project_members` (`project_id`, `user_id`, `role`)
-- VALUES (1, 42, 'editor')
-- ON DUPLICATE KEY UPDATE `role` = VALUES(`role`);

-- 複数ユーザーへ同じ案件・同じロール（例: 既定プロジェクト id=1 に viewer）
-- INSERT INTO `project_members` (`project_id`, `user_id`, `role`)
-- SELECT 1, `id`, 'viewer' FROM `users` WHERE `email` IN ('a@example.com', 'b@example.com')
-- ON DUPLICATE KEY UPDATE `role` = VALUES(`role`);

-- ------------------------------------------------------------
-- project_members: 削除（案件から外す）
-- ------------------------------------------------------------
-- DELETE FROM `project_members`
-- WHERE `project_id` = 1 AND `user_id` = 42;

-- ------------------------------------------------------------
-- resource_members: リソース単位の上書き
-- ------------------------------------------------------------
-- resolveEffectiveRole() は API で resource_type + resource_id が指定されたときのみ
-- この行を参照して project_members より優先する。
-- resource_type / resource_id の意味はフロント・API 契約に合わせる（DB側に ENUM は無い）。
-- hasAnyMembership() は user_id が一致する行があればよい（タイプ不問）。

-- INSERT INTO `resource_members` (`resource_type`, `resource_id`, `user_id`, `role`)
-- VALUES ('document', 100, 42, 'editor')
-- ON DUPLICATE KEY UPDATE `role` = VALUES(`role`);

-- ------------------------------------------------------------
-- resource_members: 削除
-- ------------------------------------------------------------
-- DELETE FROM `resource_members`
-- WHERE `resource_type` = 'document' AND `resource_id` = 100 AND `user_id` = 42;
