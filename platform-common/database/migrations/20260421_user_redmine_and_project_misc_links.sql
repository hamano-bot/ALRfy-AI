-- ユーザー別 Redmine 設定（議事録 users 拡張）+ 案件の各種リンク
USE `alrfy_ai_db_dev`;

-- users に列が無い環境向け（既に同名列がある場合は手動でスキップ）
ALTER TABLE `users`
  ADD COLUMN `redmine_base_url` VARCHAR(512) NULL DEFAULT NULL COMMENT 'Redmine オリジン',
  ADD COLUMN `redmine_api_key` VARCHAR(1024) NULL DEFAULT NULL COMMENT 'Redmine REST API キー（暗号化保存）';

CREATE TABLE IF NOT EXISTS `project_misc_links` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` INT UNSIGNED NOT NULL,
  `label` VARCHAR(255) NOT NULL,
  `url` VARCHAR(2048) NOT NULL,
  `sort_order` SMALLINT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_project_misc_links_project` (`project_id`),
  CONSTRAINT `fk_project_misc_links_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='案件の任意リンク（表示名+URL）';
