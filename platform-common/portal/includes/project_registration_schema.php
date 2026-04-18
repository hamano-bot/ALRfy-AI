<?php
declare(strict_types=1);

/**
 * POST /portal/api/projects が要求する DDL（20260420 / 20260421 の一部）を、
 * 未適用 DB でも補えるようにする。DB ユーザーに CREATE / ALTER 権限が必要。
 */
function ensureProjectRegistrationSchema(PDO $pdo): void
{
    $dbRow = $pdo->query('SELECT DATABASE()')->fetch(PDO::FETCH_NUM);
    $db = is_array($dbRow) && isset($dbRow[0]) && is_string($dbRow[0]) ? $dbRow[0] : '';
    if ($db === '') {
        return;
    }

    $tableCheck = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = :schema AND TABLE_NAME = :table'
    );
    $tableExists = static function (string $table) use ($tableCheck, $db): bool {
        $tableCheck->execute([':schema' => $db, ':table' => $table]);
        $n = $tableCheck->fetchColumn();
        return is_numeric($n) && (int) $n > 0;
    };

    if (!$tableExists('projects')) {
        throw new RuntimeException(
            '`projects` テーブルがありません。platform-common/database/migrations/20260417_platform_acl_and_apps.sql を適用してください。'
        );
    }

    $colCheck = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = :schema AND TABLE_NAME = :table AND COLUMN_NAME = :column'
    );
    $hasColumn = static function (string $table, string $column) use ($colCheck, $db): bool {
        $colCheck->execute([':schema' => $db, ':table' => $table, ':column' => $column]);
        $n = $colCheck->fetchColumn();
        return is_numeric($n) && (int) $n > 0;
    };

    if (!$hasColumn('projects', 'client_name')) {
        $pdo->exec(
            "ALTER TABLE `projects` ADD COLUMN `client_name` VARCHAR(255) NULL DEFAULT NULL COMMENT 'クライアント名'"
        );
    }
    if (!$hasColumn('projects', 'site_type')) {
        $pdo->exec(
            "ALTER TABLE `projects` ADD COLUMN `site_type` ENUM(
              'corporate','ec','member_portal','internal_portal','owned_media','product_portal','other'
            ) NULL DEFAULT NULL COMMENT 'サイト種別'"
        );
    }
    if (!$hasColumn('projects', 'site_type_other')) {
        $pdo->exec(
            "ALTER TABLE `projects` ADD COLUMN `site_type_other` VARCHAR(255) NULL DEFAULT NULL COMMENT 'site_type=other のときの自由記述'"
        );
    }
    if (!$hasColumn('projects', 'is_renewal')) {
        $pdo->exec(
            "ALTER TABLE `projects` ADD COLUMN `is_renewal` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'リニューアル案件フラグ'"
        );
    }
    if (!$hasColumn('projects', 'kickoff_date')) {
        $pdo->exec(
            "ALTER TABLE `projects` ADD COLUMN `kickoff_date` DATE NULL DEFAULT NULL COMMENT 'キックオフ日'"
        );
    }
    if (!$hasColumn('projects', 'release_due_date')) {
        $pdo->exec(
            "ALTER TABLE `projects` ADD COLUMN `release_due_date` DATE NULL DEFAULT NULL COMMENT 'リリース予定日'"
        );
    }

    if (!$tableExists('project_renewal_urls')) {
        $pdo->exec(
            'CREATE TABLE `project_renewal_urls` (
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
              COMMENT=\'リニューアル案件の対象 URL（複数行）\''
        );
    }

    if (!$tableExists('project_redmine_links')) {
        $pdo->exec(
            'CREATE TABLE `project_redmine_links` (
              `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
              `project_id` INT UNSIGNED NOT NULL,
              `redmine_project_id` INT UNSIGNED NOT NULL COMMENT \'Redmine 側のプロジェクト ID\',
              `redmine_base_url` VARCHAR(512) NULL DEFAULT NULL COMMENT \'別インスタンス用（未設定時はアプリ既定 URL）\',
              `redmine_project_name` VARCHAR(255) NULL DEFAULT NULL COMMENT \'Redmine API のプロジェクト表示名\',
              `sort_order` SMALLINT NOT NULL DEFAULT 0,
              `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`),
              UNIQUE KEY `uq_project_redmine_project` (`project_id`, `redmine_project_id`),
              KEY `idx_project_redmine_links_project` (`project_id`),
              CONSTRAINT `fk_project_redmine_links_project`
                FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
                ON UPDATE CASCADE ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
              COMMENT=\'プロジェクトに紐づく Redmine プロジェクト（複数行）\''
        );
    } elseif (!$hasColumn('project_redmine_links', 'redmine_project_name')) {
        $pdo->exec(
            "ALTER TABLE `project_redmine_links` ADD COLUMN `redmine_project_name` VARCHAR(255) NULL DEFAULT NULL COMMENT 'Redmine API のプロジェクト表示名' AFTER `redmine_base_url`"
        );
    }

    if (!$tableExists('project_misc_links')) {
        $pdo->exec(
            'CREATE TABLE `project_misc_links` (
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
              COMMENT=\'案件の任意リンク（表示名+URL）\''
        );
    }

    if (!$tableExists('project_members')) {
        $pdo->exec(
            'CREATE TABLE `project_members` (
              `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
              `project_id` INT UNSIGNED NOT NULL,
              `user_id` INT UNSIGNED NOT NULL,
              `role` VARCHAR(16) NOT NULL DEFAULT \'viewer\' COMMENT \'owner|editor|viewer\',
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
    }

    if (!$tableExists('project_hearing_sheets')) {
        $pdo->exec(
            'CREATE TABLE `project_hearing_sheets` (
              `project_id` INT UNSIGNED NOT NULL,
              `status` ENUM(\'draft\',\'finalized\',\'archived\') NOT NULL DEFAULT \'draft\'
                COMMENT \'ヒアリングシートのライフサイクル\',
              `body_json` LONGTEXT NOT NULL COMMENT \'JSON オブジェクト（確認事項表など）\',
              `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`project_id`),
              CONSTRAINT `fk_project_hearing_sheets_project`
                FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
                ON UPDATE CASCADE ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
              COMMENT=\'案件に 1:1 のヒアリングシート（常に最新1枚）\''
        );
    }
}
