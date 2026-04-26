-- 案件ヒアリングシート（1:1）。ensureProjectRegistrationSchema でも補完される。
-- 適用例: mysql ... alrfy_ai_db_dev < 20260422_project_hearing_sheets.sql

USE `alrfy_ai_db_dev`;

CREATE TABLE IF NOT EXISTS `project_hearing_sheets` (
  `project_id` INT UNSIGNED NOT NULL,
  `status` ENUM('draft','finalized','archived') NOT NULL DEFAULT 'draft'
    COMMENT 'ヒアリングシートのライフサイクル',
  `body_json` LONGTEXT NOT NULL COMMENT 'JSON オブジェクト（確認事項表など）',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`project_id`),
  CONSTRAINT `fk_project_hearing_sheets_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='案件に 1:1 のヒアリングシート（常に最新1枚）';
