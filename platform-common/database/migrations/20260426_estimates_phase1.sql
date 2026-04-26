-- ============================================================
-- Estimates Phase1 schema
-- ============================================================

USE `alrfy_ai_db_dev`;

ALTER TABLE `users`
  ADD COLUMN `team` JSON NULL COMMENT 'チームタグ(JSON配列)' AFTER `email`,
  ADD COLUMN `is_admin` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '管理者フラグ' AFTER `team`;

CREATE TABLE IF NOT EXISTS `tax_rate_master` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tax_rate_percent` DECIMAL(5,2) NOT NULL,
  `effective_from` DATE NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tax_rate_master_effective` (`effective_from`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `estimate_rule_sets` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `source_type` ENUM('google_sheet','pdf_import','manual') NOT NULL DEFAULT 'google_sheet',
  `effective_from` DATE NULL,
  `effective_to` DATE NULL,
  `status` ENUM('draft','active','archived') NOT NULL DEFAULT 'draft',
  `created_by_user_id` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_estimate_rule_sets_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `estimate_rule_versions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `rule_set_id` BIGINT UNSIGNED NOT NULL,
  `version_label` VARCHAR(100) NOT NULL,
  `snapshot_json` LONGTEXT NOT NULL,
  `created_by_user_id` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_estimate_rule_versions_set_label` (`rule_set_id`, `version_label`),
  KEY `idx_estimate_rule_versions_set` (`rule_set_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `estimate_rule_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `rule_set_id` BIGINT UNSIGNED NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `item_code` VARCHAR(100) NOT NULL,
  `item_name` VARCHAR(255) NOT NULL,
  `unit_type` ENUM('person_month','person_day','set','page','times','percent','monthly_fee','annual_fee') NOT NULL DEFAULT 'set',
  `price_type` ENUM('fixed','range','multiplier','percentage') NOT NULL DEFAULT 'fixed',
  `price_value` DECIMAL(15,2) NULL,
  `price_min` DECIMAL(15,2) NULL,
  `price_max` DECIMAL(15,2) NULL,
  `conditions_json` LONGTEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_estimate_rule_items_set_code` (`rule_set_id`, `item_code`),
  KEY `idx_estimate_rule_items_name` (`item_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `project_estimates` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` BIGINT UNSIGNED NULL,
  `estimate_number` VARCHAR(255) NOT NULL,
  `estimate_status` ENUM('draft','submitted','won','lost') NOT NULL DEFAULT 'draft',
  `title` VARCHAR(255) NOT NULL,
  `is_rough_estimate` TINYINT(1) NOT NULL DEFAULT 0,
  `client_name` VARCHAR(255) NULL,
  `recipient_text` TEXT NULL,
  `remarks` TEXT NULL COMMENT '顧客向け備考（帳票・プレビュー）',
  `issue_date` DATE NOT NULL,
  `delivery_due_text` VARCHAR(255) NULL,
  `sales_user_id` BIGINT UNSIGNED NULL,
  `visibility_scope` ENUM('public_all_users','restricted') NOT NULL DEFAULT 'public_all_users',
  `internal_memo` TEXT NULL,
  `rule_version_id` BIGINT UNSIGNED NULL,
  `applied_tax_rate_percent` DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  `applied_tax_effective_from` DATE NULL,
  `subtotal_excluding_tax` DECIMAL(15,2) NOT NULL DEFAULT 0,
  `tax_amount` DECIMAL(15,2) NOT NULL DEFAULT 0,
  `total_including_tax` DECIMAL(15,2) NOT NULL DEFAULT 0,
  `template_scope` ENUM('private','shared') NULL,
  `created_by_user_id` BIGINT UNSIGNED NOT NULL,
  `updated_by_user_id` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_project_estimates_number` (`estimate_number`),
  KEY `idx_project_estimates_project_id` (`project_id`),
  KEY `idx_project_estimates_status` (`estimate_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `project_estimate_lines` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `estimate_id` BIGINT UNSIGNED NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `major_category` VARCHAR(100) NULL,
  `category` VARCHAR(100) NULL,
  `item_code` VARCHAR(100) NULL,
  `item_name` VARCHAR(255) NOT NULL,
  `quantity` DECIMAL(15,4) NOT NULL DEFAULT 0,
  `unit_type` ENUM('person_month','person_day','set','page','times','percent','monthly_fee','annual_fee') NOT NULL DEFAULT 'set',
  `unit_price` DECIMAL(15,2) NOT NULL DEFAULT 0,
  `factor` DECIMAL(10,4) NOT NULL DEFAULT 1.0000,
  `line_amount` DECIMAL(15,2) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_project_estimate_lines_estimate` (`estimate_id`),
  KEY `idx_project_estimate_lines_sort_order` (`estimate_id`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `estimate_input_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `field_type` ENUM('category','item_name') NOT NULL,
  `value` VARCHAR(255) NOT NULL,
  `used_count` INT NOT NULL DEFAULT 1,
  `last_used_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_estimate_input_history_user_field_value` (`user_id`, `field_type`, `value`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `estimate_user_permissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `estimate_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `role` ENUM('owner','editor','viewer') NOT NULL DEFAULT 'viewer',
  `granted_by` BIGINT UNSIGNED NOT NULL,
  `granted_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_estimate_user_permissions` (`estimate_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `estimate_team_permissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `estimate_id` BIGINT UNSIGNED NOT NULL,
  `team_tag` VARCHAR(100) NOT NULL,
  `role` ENUM('owner','editor','viewer') NOT NULL DEFAULT 'viewer',
  `granted_by` BIGINT UNSIGNED NOT NULL,
  `granted_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_estimate_team_permissions` (`estimate_id`, `team_tag`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `project_team_permissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` BIGINT UNSIGNED NOT NULL,
  `team_tag` VARCHAR(100) NOT NULL,
  `role` ENUM('owner','editor','viewer') NOT NULL DEFAULT 'viewer',
  `granted_by` BIGINT UNSIGNED NOT NULL,
  `granted_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_project_team_permissions` (`project_id`, `team_tag`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `estimate_project_links` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `estimate_id` BIGINT UNSIGNED NOT NULL,
  `project_id` BIGINT UNSIGNED NOT NULL,
  `link_type` ENUM('primary','related') NOT NULL DEFAULT 'related',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_estimate_project_links` (`estimate_id`, `project_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `estimate_templates` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `scope` ENUM('private','shared') NOT NULL DEFAULT 'private',
  `created_by_user_id` BIGINT UNSIGNED NOT NULL,
  `header_json` LONGTEXT NOT NULL,
  `lines_json` LONGTEXT NOT NULL,
  `locked` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_estimate_templates_scope` (`scope`, `created_by_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `estimate_operation_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `estimate_id` BIGINT UNSIGNED NULL,
  `operation_type` VARCHAR(100) NOT NULL,
  `operator_user_id` BIGINT UNSIGNED NOT NULL,
  `detail_json` LONGTEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_estimate_operation_logs_estimate_id` (`estimate_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
