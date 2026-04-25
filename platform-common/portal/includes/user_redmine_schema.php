<?php
declare(strict_types=1);

/**
 * 議事録アプリと共有する `users` に Redmine 用列が無い場合に追加する。
 * 手動マイグレーション（20260421_user_redmine_and_project_misc_links.sql）と同等の DDL。
 * DB ユーザーに ALTER 権限が必要。
 */
function ensureUserRedmineColumns(PDO $pdo): void
{
    $dbRow = $pdo->query('SELECT DATABASE()')->fetch(PDO::FETCH_NUM);
    $db = is_array($dbRow) && isset($dbRow[0]) && is_string($dbRow[0]) ? $dbRow[0] : '';
    if ($db === '') {
        return;
    }

    $check = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = :schema AND TABLE_NAME = :table AND COLUMN_NAME = :column'
    );

    $hasColumn = static function (string $column) use ($check, $db): bool {
        $check->execute([
            ':schema' => $db,
            ':table' => 'users',
            ':column' => $column,
        ]);
        $n = $check->fetchColumn();
        return is_numeric($n) && (int) $n > 0;
    };

    $columnLength = static function (string $column) use ($pdo, $db): ?int {
        $stmt = $pdo->prepare(
            'SELECT CHARACTER_MAXIMUM_LENGTH
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = :schema AND TABLE_NAME = :table AND COLUMN_NAME = :column
             LIMIT 1'
        );
        $stmt->execute([
            ':schema' => $db,
            ':table' => 'users',
            ':column' => $column,
        ]);
        $value = $stmt->fetchColumn();
        if ($value === false || $value === null) {
            return null;
        }
        return is_numeric($value) ? (int)$value : null;
    };

    if (!$hasColumn('redmine_base_url')) {
        $pdo->exec(
            "ALTER TABLE `users` ADD COLUMN `redmine_base_url` VARCHAR(512) NULL DEFAULT NULL COMMENT 'Redmine オリジン'"
        );
    }
    if (!$hasColumn('redmine_api_key')) {
        $pdo->exec(
            "ALTER TABLE `users` ADD COLUMN `redmine_api_key` VARCHAR(1024) NULL DEFAULT NULL COMMENT 'Redmine REST API キー（暗号化保存）'"
        );
    } else {
        $len = $columnLength('redmine_api_key');
        if ($len !== null && $len < 1024) {
            $pdo->exec(
                "ALTER TABLE `users` MODIFY COLUMN `redmine_api_key` VARCHAR(1024) NULL DEFAULT NULL COMMENT 'Redmine REST API キー（暗号化保存）'"
            );
        }
    }
}
