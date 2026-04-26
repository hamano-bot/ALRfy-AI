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
$sessionUserId = (int)$_SESSION['user_id'];

try {
    $pdo = createPdoFromApplicationEnv();
    ensureEstimateSchema($pdo);
} catch (Throwable $e) {
    error_log('[estimate_rules schema] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '初期化に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'GET') {
    $ruleSetStmt = $pdo->query('SELECT id, name, source_type, effective_from, effective_to, status, created_at, updated_at FROM estimate_rule_sets ORDER BY updated_at DESC');
    $ruleSets = $ruleSetStmt->fetchAll(PDO::FETCH_ASSOC);
    $activeRuleSetId = 0;
    if (is_array($ruleSets)) {
        foreach ($ruleSets as $row) {
            if (is_array($row) && ($row['status'] ?? '') === 'active') {
                $activeRuleSetId = (int)($row['id'] ?? 0);
                break;
            }
        }
    }
    $items = [];
    if ($activeRuleSetId > 0) {
        $itemStmt = $pdo->prepare(
            'SELECT category, item_code, item_name, unit_type, price_type, price_value, price_min, price_max, conditions_json
             FROM estimate_rule_items
             WHERE rule_set_id = :rule_set_id
             ORDER BY category ASC, item_name ASC'
        );
        $itemStmt->execute([':rule_set_id' => $activeRuleSetId]);
        $items = $itemStmt->fetchAll(PDO::FETCH_ASSOC);
    }
    echo json_encode([
        'success' => true,
        'rule_sets' => is_array($ruleSets) ? $ruleSets : [],
        'active_rule_set_id' => $activeRuleSetId,
        'items' => is_array($items) ? $items : [],
    ], JSON_UNESCAPED_UNICODE);
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
    $name = isset($payload['name']) && is_string($payload['name']) ? trim($payload['name']) : '';
    $sourceType = isset($payload['source_type']) && is_string($payload['source_type']) ? $payload['source_type'] : 'google_sheet';
    $effectiveFrom = isset($payload['effective_from']) && is_string($payload['effective_from']) ? trim($payload['effective_from']) : null;
    $status = isset($payload['status']) && $payload['status'] === 'active' ? 'active' : 'draft';
    $items = isset($payload['items']) && is_array($payload['items']) ? $payload['items'] : [];

    if ($name === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'name は必須です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $normalizedItems = [];
    $seenCode = [];
    foreach ($items as $index => $item) {
        if (!is_array($item)) {
            continue;
        }
        $itemCode = isset($item['item_code']) && is_string($item['item_code']) ? trim($item['item_code']) : '';
        $itemName = isset($item['item_name']) && is_string($item['item_name']) ? trim($item['item_name']) : '';
        $category = isset($item['category']) && is_string($item['category']) ? trim($item['category']) : '';
        $unitType = isset($item['unit_type']) && is_string($item['unit_type']) ? trim($item['unit_type']) : 'set';
        $priceType = isset($item['price_type']) && is_string($item['price_type']) ? trim($item['price_type']) : 'fixed';
        $priceValue = isset($item['price_value']) && is_numeric($item['price_value']) ? (float)$item['price_value'] : null;
        $priceMin = isset($item['price_min']) && is_numeric($item['price_min']) ? (float)$item['price_min'] : null;
        $priceMax = isset($item['price_max']) && is_numeric($item['price_max']) ? (float)$item['price_max'] : null;
        $conditions = isset($item['conditions_json']) ? $item['conditions_json'] : null;
        if ($itemCode === '' || $itemName === '' || $category === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => "items[$index] の必須列（category/item_code/item_name）が不足しています。"], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if (isset($seenCode[$itemCode])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => "item_code 重複: $itemCode"], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $seenCode[$itemCode] = true;
        if (!in_array($unitType, ['person_month', 'person_day', 'set', 'page', 'times', 'percent', 'monthly_fee', 'annual_fee'], true)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => "unit_type 不正: $itemCode"], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if (!in_array($priceType, ['fixed', 'range', 'multiplier', 'percentage'], true)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => "price_type 不正: $itemCode"], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($priceType === 'fixed' && $priceValue === null) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => "fixed 単価に price_value は必須です: $itemCode"], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($priceType === 'range' && ($priceMin === null || $priceMax === null || $priceValue === null)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => "range 単価に price_min/price_max/price_value は必須です: $itemCode"], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $normalizedItems[] = [
            'category' => $category,
            'item_code' => $itemCode,
            'item_name' => $itemName,
            'unit_type' => $unitType,
            'price_type' => $priceType,
            'price_value' => $priceValue,
            'price_min' => $priceMin,
            'price_max' => $priceMax,
            'conditions_json' => json_encode($conditions ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ];
    }

    try {
        $pdo->beginTransaction();
        if ($status === 'active') {
            $pdo->exec("UPDATE estimate_rule_sets SET status = 'archived' WHERE status = 'active'");
        }
        $insSet = $pdo->prepare(
            'INSERT INTO estimate_rule_sets (name, source_type, effective_from, status, created_by_user_id)
             VALUES (:name, :source_type, :effective_from, :status, :created_by_user_id)'
        );
        $insSet->execute([
            ':name' => $name,
            ':source_type' => $sourceType,
            ':effective_from' => $effectiveFrom,
            ':status' => $status,
            ':created_by_user_id' => $sessionUserId,
        ]);
        $ruleSetId = (int)$pdo->lastInsertId();

        $insItem = $pdo->prepare(
            'INSERT INTO estimate_rule_items
             (rule_set_id, category, item_code, item_name, unit_type, price_type, price_value, price_min, price_max, conditions_json)
             VALUES
             (:rule_set_id, :category, :item_code, :item_name, :unit_type, :price_type, :price_value, :price_min, :price_max, :conditions_json)'
        );
        foreach ($normalizedItems as $row) {
            $insItem->execute([
                ':rule_set_id' => $ruleSetId,
                ':category' => $row['category'],
                ':item_code' => $row['item_code'],
                ':item_name' => $row['item_name'],
                ':unit_type' => $row['unit_type'],
                ':price_type' => $row['price_type'],
                ':price_value' => $row['price_value'],
                ':price_min' => $row['price_min'],
                ':price_max' => $row['price_max'],
                ':conditions_json' => $row['conditions_json'] !== false ? $row['conditions_json'] : '{}',
            ]);
        }

        $snapshot = json_encode(['rule_set_id' => $ruleSetId, 'items' => $normalizedItems], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $insVer = $pdo->prepare(
            'INSERT INTO estimate_rule_versions (rule_set_id, version_label, snapshot_json, created_by_user_id)
             VALUES (:rule_set_id, :version_label, :snapshot_json, :created_by_user_id)'
        );
        $insVer->execute([
            ':rule_set_id' => $ruleSetId,
            ':version_label' => 'import-' . (new DateTimeImmutable('now'))->format('YmdHis'),
            ':snapshot_json' => $snapshot !== false ? $snapshot : '{}',
            ':created_by_user_id' => $sessionUserId,
        ]);
        $versionId = (int)$pdo->lastInsertId();

        $logStmt = $pdo->prepare(
            'INSERT INTO estimate_operation_logs (estimate_id, operation_type, operator_user_id, detail_json)
             VALUES (NULL, :operation_type, :operator_user_id, :detail_json)'
        );
        $logStmt->execute([
            ':operation_type' => 'estimate_rules_imported',
            ':operator_user_id' => $sessionUserId,
            ':detail_json' => json_encode(
                [
                    'rule_set_id' => $ruleSetId,
                    'rule_version_id' => $versionId,
                    'source_type' => $sourceType,
                    'status' => $status,
                    'item_count' => count($normalizedItems),
                ],
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
            ),
        ]);

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[estimate_rules post] ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'ルール取込に失敗しました。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode(['success' => true, 'rule_set_id' => $ruleSetId, 'rule_version_id' => $versionId], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'GET / POST で実行してください。'], JSON_UNESCAPED_UNICODE);
