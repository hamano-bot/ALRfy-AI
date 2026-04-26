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
    error_log('[estimate_rule_versions schema] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '初期化に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$ruleSetId = isset($_GET['rule_set_id']) && is_string($_GET['rule_set_id']) && ctype_digit($_GET['rule_set_id']) ? (int)$_GET['rule_set_id'] : 0;
if ($ruleSetId > 0) {
    $stmt = $pdo->prepare('SELECT id, rule_set_id, version_label, created_by_user_id, created_at FROM estimate_rule_versions WHERE rule_set_id = :rule_set_id ORDER BY id DESC');
    $stmt->execute([':rule_set_id' => $ruleSetId]);
} else {
    $stmt = $pdo->query('SELECT id, rule_set_id, version_label, created_by_user_id, created_at FROM estimate_rule_versions ORDER BY id DESC LIMIT 200');
}
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
echo json_encode(['success' => true, 'versions' => is_array($rows) ? $rows : []], JSON_UNESCAPED_UNICODE);
