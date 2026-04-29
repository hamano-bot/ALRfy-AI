<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__) . '/includes/estimate_schema.php';

header('Content-Type: application/json; charset=UTF-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'PATCH') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'PATCH メソッドで実行してください。'], JSON_UNESCAPED_UNICODE);
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
    error_log('[admin_users_bulk_role schema] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '初期化に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

function adminRoleHasUsersColumn(PDO $pdo, string $column): bool
{
    try {
        $stmt = $pdo->prepare('SHOW COLUMNS FROM users LIKE :col');
        $stmt->execute([':col' => $column]);
        return $stmt->fetch(PDO::FETCH_ASSOC) !== false;
    } catch (Throwable $e) {
        error_log('[admin_users_bulk_role has column] ' . $e->getMessage());
        return false;
    }
}

function adminRoleEnsureColumn(PDO $pdo, string $column, string $ddl): void
{
    if (adminRoleHasUsersColumn($pdo, $column)) {
        return;
    }
    try {
        $pdo->exec($ddl);
    } catch (Throwable $e) {
        error_log('[admin_users_bulk_role ensure column] ' . $e->getMessage());
    }
}

adminRoleEnsureColumn($pdo, 'is_admin', "ALTER TABLE users ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0");

$meStmt = $pdo->prepare('SELECT is_admin FROM users WHERE id = :id LIMIT 1');
$meStmt->execute([':id' => $sessionUserId]);
$me = $meStmt->fetch(PDO::FETCH_ASSOC);
if (!is_array($me) || (int)($me['is_admin'] ?? 0) !== 1) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => '管理者権限が必要です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw = file_get_contents('php://input');
$payload = json_decode($raw !== false ? $raw : '', true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'JSON ボディが不正です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$userIds = isset($payload['user_ids']) && is_array($payload['user_ids']) ? $payload['user_ids'] : [];
$isAdmin = isset($payload['is_admin']) ? ((int)$payload['is_admin'] === 1 ? 1 : 0) : 0;
$dryRun = isset($payload['dry_run']) && (bool)$payload['dry_run'] === true;
$confirm = isset($payload['confirm']) && (bool)$payload['confirm'] === true;

$ids = [];
foreach ($userIds as $uid) {
    if (is_int($uid) || (is_string($uid) && ctype_digit($uid))) {
        $x = (int)$uid;
        if ($x > 0) {
            $ids[$x] = true;
        }
    }
}
$targetIds = array_keys($ids);
if ($targetIds === []) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'user_ids は必須です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($isAdmin === 0 && in_array($sessionUserId, $targetIds, true)) {
    http_response_code(409);
    echo json_encode(['success' => false, 'message' => '自分自身の管理者解除はできません。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$summary = [
    'target_user_count' => count($targetIds),
    'is_admin' => $isAdmin,
];

if ($dryRun || !$confirm) {
    echo json_encode(['success' => true, 'dry_run' => true, 'summary' => $summary], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo->beginTransaction();
    $upd = $pdo->prepare('UPDATE users SET is_admin = :is_admin WHERE id = :id');
    foreach ($targetIds as $uid) {
        $upd->execute([':is_admin' => $isAdmin, ':id' => $uid]);
    }
    $logStmt = $pdo->prepare(
        'INSERT INTO estimate_operation_logs (estimate_id, operation_type, operator_user_id, detail_json)
         VALUES (NULL, :operation_type, :operator_user_id, :detail_json)'
    );
    $logStmt->execute([
        ':operation_type' => 'admin_bulk_users_role_updated',
        ':operator_user_id' => $sessionUserId,
        ':detail_json' => json_encode(
            ['target_user_ids' => $targetIds, 'is_admin' => $isAdmin, 'target_user_count' => count($targetIds)],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        ),
    ]);
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[admin_users_bulk_role apply] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '管理者更新に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode(['success' => true, 'summary' => $summary], JSON_UNESCAPED_UNICODE);
