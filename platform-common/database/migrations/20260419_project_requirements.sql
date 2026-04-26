-- 案件要件定義ドキュメント（1:1）。ensureProjectRegistrationSchema でも補完される。
-- 適用例: mysql ... alrfy_ai_db_dev < 20260419_project_requirements.sql

USE `alrfy_ai_db_dev`;

CREATE TABLE IF NOT EXISTS `project_requirements` (
  `project_id` INT UNSIGNED NOT NULL,
  `body_json` LONGTEXT NOT NULL COMMENT '要件定義 JSON（pages 配列など）',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`project_id`),
  CONSTRAINT `fk_project_requirements_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='案件に 1:1 の要件定義（常に最新1枚）';
