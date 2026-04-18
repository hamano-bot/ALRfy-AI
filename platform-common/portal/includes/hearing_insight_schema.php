<?php
declare(strict_types=1);

/**
 * ヒアリング解析・テンプレ自動更新用テーブル（ensure パターン）。
 */
function ensureHearingInsightSchema(PDO $pdo): void
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
        return;
    }

    if (!$tableExists('hearing_analytics_items')) {
        $pdo->exec(
            'CREATE TABLE `hearing_analytics_items` (
              `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
              `project_id` INT UNSIGNED NOT NULL,
              `item_id` VARCHAR(128) NOT NULL,
              `resolved_template_id` VARCHAR(32) NOT NULL,
              `body_template_id` VARCHAR(32) NULL DEFAULT NULL,
              `category` VARCHAR(512) NOT NULL DEFAULT \'\',
              `heading` VARCHAR(512) NOT NULL DEFAULT \'\',
              `question` TEXT NOT NULL,
              `excluded_reason` VARCHAR(64) NULL DEFAULT NULL,
              `ingested_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`),
              UNIQUE KEY `uq_hearing_analytics_project_item` (`project_id`, `item_id`),
              KEY `idx_hearing_analytics_resolved` (`resolved_template_id`),
              KEY `idx_hearing_analytics_excluded` (`excluded_reason`),
              CONSTRAINT `fk_hearing_analytics_project`
                FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
                ON UPDATE CASCADE ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
              COMMENT=\'ヒアリング行の解析用フラット行（Gemini バッチ入力）\''
        );
    }

    if (!$tableExists('hearing_template_definitions')) {
        $pdo->exec(
            'CREATE TABLE `hearing_template_definitions` (
              `template_id` VARCHAR(32) NOT NULL,
              `version` INT NOT NULL DEFAULT 1,
              `items_json` LONGTEXT NOT NULL,
              `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`template_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
              COMMENT=\'テンプレ種別ごとの公開 items_json（自動更新）\''
        );
    }

    if (!$tableExists('system_update_events')) {
        $pdo->exec(
            'CREATE TABLE `system_update_events` (
              `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
              `occurred_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              `kind` VARCHAR(32) NOT NULL DEFAULT \'template\',
              `title` VARCHAR(512) NOT NULL,
              `template_id` VARCHAR(32) NULL DEFAULT NULL,
              `template_version_before` INT NULL DEFAULT NULL,
              `template_version_after` INT NULL DEFAULT NULL,
              `detail_json` LONGTEXT NULL,
              `summary` TEXT NULL,
              PRIMARY KEY (`id`),
              KEY `idx_system_update_events_occurred` (`occurred_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
              COMMENT=\'システム更新履歴（テンプレ自動更新など）\''
        );
    }

    if (!$tableExists('hearing_insight_batch_state')) {
        $pdo->exec(
            'CREATE TABLE `hearing_insight_batch_state` (
              `id` TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
              `last_run_at` DATETIME NULL DEFAULT NULL,
              `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        $pdo->exec('INSERT IGNORE INTO `hearing_insight_batch_state` (`id`, `last_run_at`) VALUES (1, NULL)');
    }

    hearingInsightSeedTemplateDefinitions($pdo);
}

/**
 * 空の items でテンプレ定義を初期化（INSERT IGNORE）。
 */
function hearingInsightSeedTemplateDefinitions(PDO $pdo): void
{
    $ids = [
        'corporate_new',
        'corporate_renewal',
        'ec_new',
        'ec_renewal',
        'generic_new',
        'generic_renewal',
    ];
    $stmt = $pdo->prepare(
        'INSERT IGNORE INTO `hearing_template_definitions` (`template_id`, `version`, `items_json`) VALUES (?, 1, ?)'
    );
    foreach ($ids as $tid) {
        $j = json_encode(['template_id' => $tid, 'items' => []], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($j !== false) {
            $stmt->execute([$tid, $j]);
        }
    }
}
