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

$userId = (int)$_SESSION['user_id'];
$fieldType = isset($_GET['field_type']) && is_string($_GET['field_type']) ? $_GET['field_type'] : 'item_name';
if ($fieldType !== 'item_name' && $fieldType !== 'category') {
    $fieldType = 'item_name';
}

try {
    $pdo = createPdoFromApplicationEnv();
    ensureEstimateSchema($pdo);
} catch (Throwable $e) {
    error_log('[estimate_suggestions schema] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '初期化に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$standard = [];
if ($fieldType === 'item_name') {
    $stmt = $pdo->query(
        'SELECT item_name, unit_type, unit_price
         FROM estimate_item_master
         WHERE is_active = 1 AND item_name IS NOT NULL AND item_name <> ""
         ORDER BY sort_order ASC, item_name ASC
         LIMIT 300'
    );
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (is_array($rows)) {
        foreach ($rows as $row) {
            if (!is_array($row) || !is_string($row['item_name'] ?? null)) {
                continue;
            }
            $name = $row['item_name'];
            $unitType = is_string($row['unit_type'] ?? null) ? $row['unit_type'] : 'set';
            $rawPrice = $row['unit_price'] ?? null;
            $unitPrice = 0.0;
            if ($rawPrice !== null && $rawPrice !== '') {
                $unitPrice = (float)$rawPrice;
            }
            $standard[] = [
                'value' => $name,
                'unit_type' => $unitType,
                'unit_price' => $unitPrice,
                'from' => 'master',
            ];
        }
    }
} else {
    $stmt = $pdo->query('SELECT DISTINCT category FROM estimate_rule_items WHERE category IS NOT NULL AND category <> "" ORDER BY category ASC LIMIT 100');
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (is_array($rows)) {
        foreach ($rows as $row) {
            if (is_array($row) && is_string($row['category'] ?? null)) {
                $standard[] = $row['category'];
            }
        }
    }
}

$historyStmt = $pdo->prepare(
    'SELECT value
     FROM estimate_input_history
     WHERE user_id = :uid AND field_type = :field_type
     ORDER BY used_count DESC, last_used_at DESC
     LIMIT 100'
);
$historyStmt->execute([':uid' => $userId, ':field_type' => $fieldType]);
$historyRows = $historyStmt->fetchAll(PDO::FETCH_ASSOC);
$history = [];
if (is_array($historyRows)) {
    foreach ($historyRows as $row) {
        if (is_array($row) && is_string($row['value'] ?? null)) {
            $history[] = $row['value'];
        }
    }
}

echo json_encode([
    'success' => true,
    'field_type' => $fieldType,
    'standard' => $standard,
    'history' => $history,
], JSON_UNESCAPED_UNICODE);
