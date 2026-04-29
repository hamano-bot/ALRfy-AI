<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__) . '/includes/estimate_schema.php';

header('Content-Type: application/json; charset=UTF-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'GET メソッドで実行してください。'], JSON_UNESCAPED_UNICODE);
    exit;
}
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'ログインが必要です。'], JSON_UNESCAPED_UNICODE);
    exit;
}
$sessionUserId = (int)$_SESSION['user_id'];

try {
    $pdo = createPdoFromApplicationEnv();
    ensureEstimateSchema($pdo);
} catch (Throwable $e) {
    error_log('[admin_users schema] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '初期化に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * users テーブルに指定カラムがあるか
 */
function adminUsersHasUsersColumn(PDO $pdo, string $column): bool
{
    try {
        $stmt = $pdo->prepare('SHOW COLUMNS FROM users LIKE :col');
        $stmt->execute([':col' => $column]);
        return $stmt->fetch(PDO::FETCH_ASSOC) !== false;
    } catch (Throwable $e) {
        error_log('[admin_users has column] ' . $e->getMessage());
        return false;
    }
}

function adminUsersEnsureColumn(PDO $pdo, string $column, string $ddl): void
{
    if (adminUsersHasUsersColumn($pdo, $column)) {
        return;
    }
    try {
        $pdo->exec($ddl);
    } catch (Throwable $e) {
        error_log('[admin_users ensure column] ' . $e->getMessage());
    }
}

adminUsersEnsureColumn($pdo, 'display_name', "ALTER TABLE users ADD COLUMN display_name VARCHAR(255) NULL AFTER email");
adminUsersEnsureColumn($pdo, 'team', "ALTER TABLE users ADD COLUMN team TEXT NULL AFTER display_name");
adminUsersEnsureColumn($pdo, 'is_admin', "ALTER TABLE users ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0 AFTER team");
adminUsersEnsureColumn($pdo, 'created_at', "ALTER TABLE users ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
adminUsersEnsureColumn($pdo, 'updated_at', "ALTER TABLE users ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

// users.is_admin が無い古い環境も許容
$hasIsAdmin = adminUsersHasUsersColumn($pdo, 'is_admin');
$meStmt = $pdo->prepare(sprintf(
    'SELECT %s FROM users WHERE id = :id LIMIT 1',
    $hasIsAdmin ? 'is_admin' : '0 AS is_admin'
));
$meStmt->execute([':id' => $sessionUserId]);
$me = $meStmt->fetch(PDO::FETCH_ASSOC);
$isAdmin = is_array($me) && (int)($me['is_admin'] ?? 0) === 1;

$displayNameSelect = adminUsersHasUsersColumn($pdo, 'display_name') ? 'display_name' : 'NULL AS display_name';
$teamSelect = adminUsersHasUsersColumn($pdo, 'team') ? 'team' : 'NULL AS team';
$isAdminSelect = $hasIsAdmin ? 'is_admin' : '0 AS is_admin';
$createdAtSelect = adminUsersHasUsersColumn($pdo, 'created_at') ? 'created_at' : 'NULL AS created_at';
$updatedAtSelect = adminUsersHasUsersColumn($pdo, 'updated_at') ? 'updated_at' : 'NULL AS updated_at';
$stmt = $pdo->query(sprintf(
    'SELECT id, email, %s, %s, %s, %s, %s FROM users ORDER BY id ASC',
    $displayNameSelect,
    $teamSelect,
    $isAdminSelect,
    $createdAtSelect,
    $updatedAtSelect
));
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
echo json_encode(['success' => true, 'users' => is_array($rows) ? $rows : [], 'can_admin' => $isAdmin], JSON_UNESCAPED_UNICODE);
