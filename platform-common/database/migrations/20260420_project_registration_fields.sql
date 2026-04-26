-- ============================================================
-- Project 新規登録用: projects 拡張 + project_renewal_urls + project_redmine_links
-- DB: alrfy_ai_db_dev（20260417_platform_acl_and_apps.sql 適用済み前提）
-- 適用例: mysql ... alrfy_ai_db_dev < 20260420_project_registration_fields.sql
-- ============================================================

USE `alrfy_ai_db_dev`;

-- ------------------------------------------------------------
-- projects に登録項目列を追加
-- ------------------------------------------------------------
ALTER TABLE `projects`
  ADD COLUMN `client_name` VARCHAR(255) NULL DEFAULT NULL COMMENT 'クライアント名' AFTER `name`,
  ADD COLUMN `site_type` ENUM(
    'corporate',
    'ec',
    'member_portal',
    'internal_portal',
    'owned_media',
    'product_portal',
    'other'
  ) NULL DEFAULT NULL COMMENT 'サイト種別' AFTER `client_name`,
  ADD COLUMN `site_type_other` VARCHAR(255) NULL DEFAULT NULL COMMENT 'site_type=other のときの自由記述' AFTER `site_type`,
  ADD COLUMN `is_renewal` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'リニューアル案件フラグ' AFTER `site_type_other`,
  ADD COLUMN `kickoff_date` DATE NULL DEFAULT NULL COMMENT 'キックオフ日' AFTER `is_renewal`,
  ADD COLUMN `release_due_date` DATE NULL DEFAULT NULL COMMENT 'リリース予定日' AFTER `kickoff_date`;

-- ------------------------------------------------------------
-- project_renewal_urls（リニューアル時の対象 URL 複数）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `project_renewal_urls` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` INT UNSIGNED NOT NULL,
  `url` VARCHAR(2048) NOT NULL,
  `sort_order` SMALLINT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_project_renewal_urls_project` (`project_id`),
  CONSTRAINT `fk_project_renewal_urls_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='リニューアル案件の対象 URL（複数行）';

-- ------------------------------------------------------------
-- project_redmine_links（Redmine プロジェクト ID 複数）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `project_redmine_links` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` INT UNSIGNED NOT NULL,
  `redmine_project_id` INT UNSIGNED NOT NULL COMMENT 'Redmine 側のプロジェクト ID',
  `redmine_base_url` VARCHAR(512) NULL DEFAULT NULL COMMENT '別インスタンス用（未設定時はアプリ既定 URL）',
  `sort_order` SMALLINT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_project_redmine_project` (`project_id`, `redmine_project_id`),
  KEY `idx_project_redmine_links_project` (`project_id`),
  CONSTRAINT `fk_project_redmine_links_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='プロジェクトに紐づく Redmine プロジェクト（複数行）';

-- ============================================================
-- ロールバック（手動・検証環境向け。本番はバックアップから復元推奨）
-- ============================================================
-- DROP TABLE IF EXISTS `project_redmine_links`;
-- DROP TABLE IF EXISTS `project_renewal_urls`;
-- ALTER TABLE `projects`
--   DROP COLUMN `release_due_date`,
--   DROP COLUMN `kickoff_date`,
--   DROP COLUMN `is_renewal`,
--   DROP COLUMN `site_type_other`,
--   DROP COLUMN `site_type`,
--   DROP COLUMN `client_name`;
