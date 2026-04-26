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

$meStmt = $pdo->prepare('SELECT is_admin FROM users WHERE id = :id LIMIT 1');
$meStmt->execute([':id' => $sessionUserId]);
$me = $meStmt->fetch(PDO::FETCH_ASSOC);
if (!is_array($me) || (int)($me['is_admin'] ?? 0) !== 1) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => '管理者権限が必要です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$stmt = $pdo->query('SELECT id, email, display_name, team, is_admin, created_at, updated_at FROM users ORDER BY id ASC');
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
echo json_encode(['success' => true, 'users' => is_array($rows) ? $rows : []], JSON_UNESCAPED_UNICODE);
