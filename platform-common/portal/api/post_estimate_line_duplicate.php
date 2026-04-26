<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__) . '/includes/estimate_schema.php';

header('Content-Type: application/json; charset=UTF-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'POST メソッドで実行してください。'], JSON_UNESCAPED_UNICODE);
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
    error_log('[estimate_line_duplicate schema] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '初期化に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw = file_get_contents('php://input');
$payload = json_decode($raw !== false ? $raw : '', true);
if (!is_array($payload) || !isset($payload['line_id']) || !is_numeric($payload['line_id'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'line_id は必須です。'], JSON_UNESCAPED_UNICODE);
    exit;
}
$lineId = (int)$payload['line_id'];

$stmt = $pdo->prepare('SELECT * FROM project_estimate_lines WHERE id = :id LIMIT 1');
$stmt->execute([':id' => $lineId]);
$line = $stmt->fetch(PDO::FETCH_ASSOC);
if (!is_array($line)) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => '明細行が見つかりません。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$maxStmt = $pdo->prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM project_estimate_lines WHERE estimate_id = :eid');
$maxStmt->execute([':eid' => $line['estimate_id']]);
$maxSort = (int)($maxStmt->fetchColumn() ?: 0);

$ins = $pdo->prepare(
    'INSERT INTO project_estimate_lines
     (estimate_id, sort_order, major_category, category, item_code, item_name, quantity, unit_type, unit_price, factor, line_amount)
     VALUES
     (:estimate_id, :sort_order, :major_category, :category, :item_code, :item_name, :quantity, :unit_type, :unit_price, :factor, :line_amount)'
);
$ins->execute([
    ':estimate_id' => $line['estimate_id'],
    ':sort_order' => $maxSort + 1,
    ':major_category' => $line['major_category'] ?? null,
    ':category' => $line['category'] ?? null,
    ':item_code' => $line['item_code'] ?? null,
    ':item_name' => $line['item_name'] ?? '',
    ':quantity' => $line['quantity'] ?? 0,
    ':unit_type' => $line['unit_type'] ?? 'set',
    ':unit_price' => $line['unit_price'] ?? 0,
    ':factor' => $line['factor'] ?? 1,
    ':line_amount' => $line['line_amount'] ?? 0,
]);

echo json_encode(['success' => true, 'line_id' => (int)$pdo->lastInsertId()], JSON_UNESCAPED_UNICODE);
