-- ============================================================
-- 開発用: 既存の全 users を 既定プロジェクト (id=1) に editor で紐づける
-- 本番では使わず、手動で project_members を運用すること。
-- 前提: migrations/20260417_platform_acl_and_apps.sql 適用済み
-- ============================================================

USE `minutes_record_db`;

INSERT INTO `project_members` (`project_id`, `user_id`, `role`)
SELECT 1, `id`, 'editor'
FROM `users`
ON DUPLICATE KEY UPDATE `role` = VALUES(`role`);
