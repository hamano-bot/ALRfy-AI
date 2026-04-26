-- ============================================================
-- projects: 区分3値化 + リリース済みフラグ追加
-- 適用例: mysql ... alrfy_ai_db_dev < 20260426_project_category_and_release_flag.sql
-- ============================================================

USE `alrfy_ai_db_dev`;

ALTER TABLE `projects`
  ADD COLUMN `project_category` ENUM('new','renewal','improvement') NOT NULL DEFAULT 'new' COMMENT '案件区分' AFTER `is_renewal`,
  ADD COLUMN `is_released` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'リリース済みフラグ' AFTER `release_due_date`;

UPDATE `projects`
SET `project_category` = CASE
  WHEN `is_renewal` = 1 THEN 'renewal'
  ELSE 'new'
END
WHERE `project_category` = 'new';
