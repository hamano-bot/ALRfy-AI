-- 要件エディタ用テンプレート（ログインユーザ単位。公開は全ログインユーザが参照可）
-- 適用例: mysql ... minutes_record_db < 20260425_requirements_editor_templates.sql

USE `minutes_record_db`;

CREATE TABLE IF NOT EXISTS `requirements_editor_templates` (
  `id` CHAR(36) NOT NULL COMMENT 'UUID',
  `created_by_user_id` INT UNSIGNED NOT NULL,
  `name` VARCHAR(200) NOT NULL COMMENT '表示名（作成者内で一意）',
  `doc_json` LONGTEXT NOT NULL COMMENT 'TipTap JSON',
  `visibility` ENUM('private', 'public') NOT NULL DEFAULT 'private' COMMENT 'private=作成者のみ, public=ログインユーザ全員',
  `locked` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=ロック（非作成者は変更不可。作成者のみ解除・更新可）',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_req_templates_creator_name` (`created_by_user_id`, `name`),
  KEY `idx_req_templates_visibility` (`visibility`),
  KEY `idx_req_templates_creator` (`created_by_user_id`),
  CONSTRAINT `fk_req_templates_user`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='要件エディタの保存テンプレート';
