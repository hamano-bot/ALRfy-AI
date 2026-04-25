-- ============================================================
-- redmine_api_key 平文 -> 暗号化 移行の事前/事後チェック SQL
-- 実データ更新は database/scripts/migrate-redmine-api-keys.php を使用
-- ============================================================

USE `minutes_record_db`;

-- 1) 移行対象（prefix なし = 旧平文）件数
SELECT COUNT(*) AS plain_target_count
FROM `users`
WHERE `redmine_api_key` IS NOT NULL
  AND TRIM(`redmine_api_key`) <> ''
  AND `redmine_api_key` NOT LIKE 'sodium:%'
  AND `redmine_api_key` NOT LIKE 'openssl:%';

-- 2) すでに暗号化済み件数（参考）
SELECT
  SUM(CASE WHEN `redmine_api_key` LIKE 'sodium:%' THEN 1 ELSE 0 END) AS sodium_count,
  SUM(CASE WHEN `redmine_api_key` LIKE 'openssl:%' THEN 1 ELSE 0 END) AS openssl_count
FROM `users`
WHERE `redmine_api_key` IS NOT NULL
  AND TRIM(`redmine_api_key`) <> '';

-- 3) 先頭 50 件の確認（必要なら）
SELECT `id`, `email`, LEFT(`redmine_api_key`, 16) AS key_prefix_preview
FROM `users`
WHERE `redmine_api_key` IS NOT NULL
  AND TRIM(`redmine_api_key`) <> ''
ORDER BY `id`
LIMIT 50;
