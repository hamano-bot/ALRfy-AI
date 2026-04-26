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

try {
    $pdo = createPdoFromApplicationEnv();
    ensureEstimateSchema($pdo);
} catch (Throwable $e) {
    error_log('[estimate_operation_logs schema] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '初期化に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$estimateId = isset($_GET['estimate_id']) && is_string($_GET['estimate_id']) && ctype_digit($_GET['estimate_id']) ? (int)$_GET['estimate_id'] : 0;
if ($estimateId <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'estimate_id を指定してください。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$stmt = $pdo->prepare(
    'SELECT id, estimate_id, operation_type, operator_user_id, detail_json, created_at
     FROM estimate_operation_logs
     WHERE estimate_id = :estimate_id
     ORDER BY id DESC
     LIMIT 200'
);
$stmt->execute([':estimate_id' => $estimateId]);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
echo json_encode(['success' => true, 'logs' => is_array($rows) ? $rows : []], JSON_UNESCAPED_UNICODE);
