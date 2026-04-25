<?php
declare(strict_types=1);

/**
 * users.redmine_api_key の既存平文を暗号化形式へ移行する CLI バッチ。
 *
 * 使い方:
 *   php platform-common/database/scripts/migrate-redmine-api-keys.php --dry-run
 *   php platform-common/database/scripts/migrate-redmine-api-keys.php --apply
 *
 * 前提:
 * - REDMINE_API_KEY_ENCRYPTION_KEY または REDMINE_API_KEY_ENCRYPTION_KEY_B64 が設定済み
 * - DB 接続情報は既存 bootstrap の設定を利用
 */

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI で実行してください。\n");
    exit(1);
}

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__, 2) . '/auth/redmine_secret.php';

$args = $argv ?? [];
$apply = in_array('--apply', $args, true);
$dryRun = !$apply;

if (in_array('--help', $args, true) || in_array('-h', $args, true)) {
    echo "Usage:\n";
    echo "  php platform-common/database/scripts/migrate-redmine-api-keys.php --dry-run\n";
    echo "  php platform-common/database/scripts/migrate-redmine-api-keys.php --apply\n";
    exit(0);
}

if (platformRedmineSecretKey() === null) {
    fwrite(STDERR, "暗号化キーが未設定です。REDMINE_API_KEY_ENCRYPTION_KEY(_B64) を設定してください。\n");
    exit(1);
}

try {
    $pdo = createPdoFromApplicationEnv();
} catch (Throwable $e) {
    fwrite(STDERR, "DB 接続に失敗しました: " . $e->getMessage() . "\n");
    exit(1);
}

$selectSql = <<<SQL
SELECT id, redmine_api_key
FROM users
WHERE redmine_api_key IS NOT NULL
  AND TRIM(redmine_api_key) <> ''
  AND redmine_api_key NOT LIKE 'sodium:%'
  AND redmine_api_key NOT LIKE 'openssl:%'
ORDER BY id ASC
SQL;

try {
    $rows = $pdo->query($selectSql)->fetchAll(PDO::FETCH_ASSOC);
} catch (Throwable $e) {
    fwrite(STDERR, "対象データの取得に失敗しました: " . $e->getMessage() . "\n");
    exit(1);
}

if (!is_array($rows) || count($rows) === 0) {
    echo "対象ユーザーは 0 件です。すでに移行済みです。\n";
    exit(0);
}

$targets = [];
foreach ($rows as $row) {
    if (!is_array($row)) {
        continue;
    }
    $id = isset($row['id']) ? (int)$row['id'] : 0;
    $stored = isset($row['redmine_api_key']) && is_string($row['redmine_api_key']) ? trim($row['redmine_api_key']) : '';
    if ($id <= 0 || $stored === '') {
        continue;
    }

    try {
        $cipher = platformRedmineApiKeyEncrypt($stored);
    } catch (Throwable $e) {
        fwrite(STDERR, "id={$id} の暗号化に失敗: " . $e->getMessage() . "\n");
        exit(1);
    }
    $targets[] = [
        'id' => $id,
        'cipher' => $cipher,
    ];
}

echo "対象件数: " . count($targets) . "\n";
echo "モード: " . ($dryRun ? 'dry-run（更新なし）' : 'apply（更新あり）') . "\n";

if ($dryRun) {
    $preview = array_slice($targets, 0, 10);
    foreach ($preview as $item) {
        echo "- id=" . $item['id'] . " -> " . (str_starts_with($item['cipher'], 'sodium:') ? 'sodium' : 'openssl') . "\n";
    }
    if (count($targets) > count($preview)) {
        echo "... and " . (count($targets) - count($preview)) . " more\n";
    }
    echo "実更新する場合は --apply を指定してください。\n";
    exit(0);
}

try {
    $pdo->beginTransaction();
    $upd = $pdo->prepare('UPDATE users SET redmine_api_key = :key WHERE id = :id');
    foreach ($targets as $item) {
        $upd->execute([
            ':key' => $item['cipher'],
            ':id' => $item['id'],
        ]);
    }
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, "更新に失敗しました: " . $e->getMessage() . "\n");
    exit(1);
}

echo "移行完了: " . count($targets) . " 件を暗号化しました。\n";
