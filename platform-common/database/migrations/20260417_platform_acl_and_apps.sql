-- ============================================================
-- platform-common ACL + ポータル apps（minutes_record_db 共有）
-- 適用: mysql クライアントで minutes_record_db を選択して実行
-- 期待: users テーブルは既存（議事録 init 済み）
-- ============================================================

USE `minutes_record_db`;

-- ------------------------------------------------------------
-- projects（案件・プロダクト単位の論理コンテナ）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `projects` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'プロジェクトID',
  `name` VARCHAR(255) NOT NULL COMMENT '表示名',
  `slug` VARCHAR(64) NULL DEFAULT NULL COMMENT 'URL用スラッグ（任意・一意）',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_projects_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='platform-common / project-manager 共通のプロジェクト';

-- ------------------------------------------------------------
-- project_members（user_id + project_id のロール）
-- permission_helper.php の SELECT と一致
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `project_members` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` INT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `role` VARCHAR(16) NOT NULL DEFAULT 'viewer' COMMENT 'owner|editor|viewer',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_project_members_project_user` (`project_id`, `user_id`),
  KEY `idx_project_members_user_id` (`user_id`),
  KEY `idx_project_members_project_id` (`project_id`),
  CONSTRAINT `fk_project_members_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_project_members_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- resource_members（リソース単位の上書きロール）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `resource_members` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `resource_type` VARCHAR(64) NOT NULL COMMENT '例: document, meeting',
  `resource_id` INT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `role` VARCHAR(16) NOT NULL DEFAULT 'viewer' COMMENT 'owner|editor|viewer',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_resource_members` (`resource_type`, `resource_id`, `user_id`),
  KEY `idx_resource_members_user_id` (`user_id`),
  CONSTRAINT `fk_resource_members_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- resource_acl_logs（権限変更の監査。将来の管理UI/API用）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `resource_acl_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `actor_user_id` INT UNSIGNED NULL COMMENT '操作したユーザー',
  `target_user_id` INT UNSIGNED NULL COMMENT '対象ユーザー（任意）',
  `resource_type` VARCHAR(64) NULL DEFAULT NULL,
  `resource_id` INT UNSIGNED NULL DEFAULT NULL,
  `action` VARCHAR(64) NOT NULL COMMENT 'grant|revoke|role_change 等',
  `payload` TEXT NULL COMMENT '変更詳細（JSON 文字列推奨）',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_resource_acl_logs_created` (`created_at`),
  KEY `idx_resource_acl_logs_actor` (`actor_user_id`),
  CONSTRAINT `fk_resource_acl_logs_actor`
    FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_resource_acl_logs_target`
    FOREIGN KEY (`target_user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- apps / app_access_policies（GET /me / GET /apps 用）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `apps` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `app_key` VARCHAR(64) NOT NULL COMMENT '例: minutes-record',
  `name` VARCHAR(255) NOT NULL COMMENT '表示名',
  `route` VARCHAR(512) NOT NULL COMMENT 'フロントが遷移するパスまたはURL',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `display_order` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_apps_app_key` (`app_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `app_access_policies` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `app_id` INT UNSIGNED NOT NULL,
  `required_role` VARCHAR(16) NOT NULL DEFAULT 'viewer' COMMENT 'owner|editor|viewer',
  `is_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_app_access_policies_app` (`app_id`),
  CONSTRAINT `fk_app_access_policies_app`
    FOREIGN KEY (`app_id`) REFERENCES `apps` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- シード: 既定プロジェクト（id=1 固定で dev シードと整合）
-- ------------------------------------------------------------
INSERT INTO `projects` (`id`, `name`, `slug`, `created_at`, `updated_at`)
VALUES (1, '既定プロジェクト', 'default', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `slug` = VALUES(`slug`);

-- ------------------------------------------------------------
-- シード: アプリ定義（api_contracts.md と整合）
-- route は環境に合わせて後から UPDATE 可
-- ------------------------------------------------------------
INSERT INTO `apps` (`app_key`, `name`, `route`, `is_active`, `display_order`)
VALUES
  ('minutes-record', '議事録アプリ', '/minutes', 1, 10),
  ('project-manager', '案件管理', '/projects', 1, 20)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `route` = VALUES(`route`),
  `is_active` = VALUES(`is_active`),
  `display_order` = VALUES(`display_order`);

INSERT INTO `app_access_policies` (`app_id`, `required_role`, `is_enabled`)
SELECT a.`id`, 'viewer', 1 FROM `apps` a WHERE a.`app_key` = 'minutes-record'
ON DUPLICATE KEY UPDATE `required_role` = VALUES(`required_role`), `is_enabled` = VALUES(`is_enabled`);

INSERT INTO `app_access_policies` (`app_id`, `required_role`, `is_enabled`)
SELECT a.`id`, 'editor', 1 FROM `apps` a WHERE a.`app_key` = 'project-manager'
ON DUPLICATE KEY UPDATE `required_role` = VALUES(`required_role`), `is_enabled` = VALUES(`is_enabled`);
