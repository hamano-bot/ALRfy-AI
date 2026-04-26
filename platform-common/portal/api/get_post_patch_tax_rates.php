<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__) . '/includes/estimate_schema.php';

header('Content-Type: application/json; charset=UTF-8');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'ログインが必要です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = createPdoFromApplicationEnv();
    ensureEstimateSchema($pdo);
} catch (Throwable $e) {
    error_log('[tax_rates schema] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '初期化に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'GET') {
    $stmt = $pdo->query('SELECT id, tax_rate_percent, effective_from, is_active FROM tax_rate_master ORDER BY effective_from DESC');
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(['success' => true, 'tax_rates' => is_array($rows) ? $rows : []], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw !== false ? $raw : '', true);
    if (!is_array($payload)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'JSON ボディが不正です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $rate = isset($payload['tax_rate_percent']) && is_numeric($payload['tax_rate_percent']) ? (float)$payload['tax_rate_percent'] : null;
    $from = isset($payload['effective_from']) && is_string($payload['effective_from']) ? trim($payload['effective_from']) : '';
    if ($rate === null || $from === '' || preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) !== 1) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'tax_rate_percent と effective_from は必須です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $ins = $pdo->prepare('INSERT INTO tax_rate_master (tax_rate_percent, effective_from, is_active) VALUES (:rate, :from, 1)');
    $ins->execute([':rate' => $rate, ':from' => $from]);
    echo json_encode(['success' => true, 'id' => (int)$pdo->lastInsertId()], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'PATCH') {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw !== false ? $raw : '', true);
    if (!is_array($payload) || !isset($payload['id']) || !is_numeric($payload['id'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'id は必須です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $id = (int)$payload['id'];
    $rate = isset($payload['tax_rate_percent']) && is_numeric($payload['tax_rate_percent']) ? (float)$payload['tax_rate_percent'] : null;
    $from = isset($payload['effective_from']) && is_string($payload['effective_from']) ? trim($payload['effective_from']) : null;
    $active = isset($payload['is_active']) ? ((int)$payload['is_active'] === 1 ? 1 : 0) : null;
    $upd = $pdo->prepare(
        'UPDATE tax_rate_master
         SET tax_rate_percent = COALESCE(:rate, tax_rate_percent),
             effective_from = COALESCE(:effective_from, effective_from),
             is_active = COALESCE(:is_active, is_active)
         WHERE id = :id'
    );
    $upd->execute([
        ':rate' => $rate,
        ':effective_from' => $from,
        ':is_active' => $active,
        ':id' => $id,
    ]);
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'GET / POST / PATCH で実行してください。'], JSON_UNESCAPED_UNICODE);
