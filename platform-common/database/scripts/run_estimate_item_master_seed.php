<?php
declare(strict_types=1);

/**
 * estimate_item_master 用シード SQL を実行する（CLI）。
 *
 * 前提: platform-common の auth/bootstrap.php が参照する config.php と
 *       任意で .env.platform-common（DB_DSN 等）が利用可能なこと。
 *
 * 使い方（リポジトリルートから）:
 *   php platform-common/database/scripts/run_estimate_item_master_seed.php
 */

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI で実行してください。\n");
    exit(1);
}

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';

$seedFile = dirname(__DIR__) . '/seeds/estimate_item_master_from_price_csv.sql';
if (!is_file($seedFile)) {
    fwrite(STDERR, "シードファイルが見つかりません: {$seedFile}\n");
    exit(1);
}

$sql = file_get_contents($seedFile);
if ($sql === false) {
    fwrite(STDERR, "シードファイルを読めませんでした。\n");
    exit(1);
}

try {
    $pdo = createPdoFromApplicationEnv();
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (Throwable $e) {
    fwrite(STDERR, 'DB 接続に失敗しました: ' . $e->getMessage() . "\n");
    exit(1);
}

try {
    $pdo->exec('SET NAMES utf8mb4');
    if (!preg_match('/INSERT INTO[\s\S]+;/u', $sql, $m)) {
        fwrite(STDERR, "INSERT 文が見つかりません。\n");
        exit(1);
    }
    $pdo->exec($m[0]);
} catch (Throwable $e) {
    fwrite(STDERR, 'SQL 実行に失敗しました: ' . $e->getMessage() . "\n");
    exit(1);
}

echo "OK: estimate_item_master をシードしました（{$seedFile}）\n";
