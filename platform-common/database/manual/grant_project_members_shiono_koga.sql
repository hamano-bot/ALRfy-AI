-- ============================================================
-- shiono@shift-jp.net / m.koga@shift-jp.net を Project 管理利用可にする
--
-- 内容: 既定プロジェクト (projects.id = 1) へ project_members を付与
-- ロール: editor（app_access_policies で project-manager が editor 必須のため）
--
-- 前提:
--   - 対象ユーザーが一度 OAuth ログイン済みで users 行が存在すること
--   - マイグレーション 20260417_platform_acl_and_apps.sql 適用済み（projects id=1）
--
-- 適用例:
--   mysql -h ... -u ... -p alrfy_ai_db_dev < platform-common/database/manual/grant_project_members_shiono_koga.sql
--
-- 毎回の付与はスクリプト推奨（docker cp 不要）:
--   .\platform-common\database\scripts\grant-project-members.ps1 shiono@shift-jp.net m.koga@shift-jp.net
-- ============================================================

USE `alrfy_ai_db_dev`;

INSERT INTO `project_members` (`project_id`, `user_id`, `role`)
SELECT 1, `id`, 'editor'
FROM `users`
WHERE `email` IN ('shiono@shift-jp.net', 'm.koga@shift-jp.net')
ON DUPLICATE KEY UPDATE `role` = VALUES(`role`);

-- 付与結果の確認（行が 0 なら users に該当メールが無い = 未ログイン等）
SELECT pm.`project_id`, p.`name` AS project_name, u.`email`, pm.`role`
FROM `project_members` pm
JOIN `projects` p ON p.`id` = pm.`project_id`
JOIN `users` u ON u.`id` = pm.`user_id`
WHERE u.`email` IN ('shiono@shift-jp.net', 'm.koga@shift-jp.net')
ORDER BY u.`email`;
