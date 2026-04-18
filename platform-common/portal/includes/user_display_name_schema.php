<?php
declare(strict_types=1);

/**
 * 議事録アプリと共有する `users` に表示名列が無い場合に追加する。
 */
function ensureUserDisplayNameColumn(PDO $pdo): void
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
    $check->execute([
        ':schema' => $db,
        ':table' => 'users',
        ':column' => 'display_name',
    ]);
    $n = $check->fetchColumn();
    if (is_numeric($n) && (int) $n > 0) {
        return;
    }

    $pdo->exec(
        "ALTER TABLE `users` ADD COLUMN `display_name` VARCHAR(255) NULL DEFAULT NULL COMMENT '表示名（Google 等）'"
    );
}
