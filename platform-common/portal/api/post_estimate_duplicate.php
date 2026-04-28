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
$sessionUserId = (int)$_SESSION['user_id'];

try {
    $pdo = createPdoFromApplicationEnv();
    ensureEstimateSchema($pdo);
} catch (Throwable $e) {
    error_log('[estimate_duplicate schema] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '初期化に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw = file_get_contents('php://input');
$payload = json_decode($raw !== false ? $raw : '', true);
if (!is_array($payload) || !isset($payload['estimate_id']) || !is_numeric($payload['estimate_id'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'estimate_id は必須です。'], JSON_UNESCAPED_UNICODE);
    exit;
}
$estimateId = (int)$payload['estimate_id'];

$stmt = $pdo->prepare('SELECT * FROM project_estimates WHERE id = :id LIMIT 1');
$stmt->execute([':id' => $estimateId]);
$base = $stmt->fetch(PDO::FETCH_ASSOC);
if (!is_array($base)) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => '複製元見積が見つかりません。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo->beginTransaction();
    $issuedOn = (new DateTimeImmutable('now', new DateTimeZone('Asia/Tokyo')))->format('Y-m-d');
    $newNumber = sprintf('見積_%s_COPY_%04d', (new DateTimeImmutable('now'))->format('Ymd'), random_int(1, 9999));
    $ins = $pdo->prepare(
        'INSERT INTO project_estimates
         (project_id, estimate_number, estimate_status, title, is_rough_estimate, client_name, client_abbr, recipient_text, remarks, issue_date, delivery_due_text, sales_user_id,
          visibility_scope, internal_memo, rule_version_id, applied_tax_rate_percent, applied_tax_effective_from,
          subtotal_excluding_tax, tax_amount, total_including_tax, created_by_user_id, updated_by_user_id)
         VALUES
         (:project_id, :estimate_number, :estimate_status, :title, :is_rough_estimate, :client_name, :client_abbr, :recipient_text, :remarks, :issue_date, :delivery_due_text, :sales_user_id,
          :visibility_scope, :internal_memo, :rule_version_id, :applied_tax_rate_percent, :applied_tax_effective_from,
          :subtotal_excluding_tax, :tax_amount, :total_including_tax, :created_by_user_id, :updated_by_user_id)'
    );
    $ins->execute([
        ':project_id' => $base['project_id'] ?? null,
        ':estimate_number' => $newNumber,
        ':estimate_status' => 'draft',
        ':title' => '新規見積',
        ':is_rough_estimate' => (int)($base['is_rough_estimate'] ?? 0),
        ':client_name' => null,
        ':client_abbr' => null,
        ':recipient_text' => null,
        ':remarks' => $base['remarks'] ?? null,
        ':issue_date' => $issuedOn,
        ':delivery_due_text' => $base['delivery_due_text'] ?? null,
        ':sales_user_id' => $base['sales_user_id'] ?? null,
        ':visibility_scope' => $base['visibility_scope'] ?? 'public_all_users',
        ':internal_memo' => $base['internal_memo'] ?? null,
        ':rule_version_id' => $base['rule_version_id'] ?? null,
        ':applied_tax_rate_percent' => $base['applied_tax_rate_percent'] ?? 10,
        ':applied_tax_effective_from' => $base['applied_tax_effective_from'] ?? null,
        ':subtotal_excluding_tax' => $base['subtotal_excluding_tax'] ?? 0,
        ':tax_amount' => $base['tax_amount'] ?? 0,
        ':total_including_tax' => $base['total_including_tax'] ?? 0,
        ':created_by_user_id' => $sessionUserId,
        ':updated_by_user_id' => $sessionUserId,
    ]);
    $newId = (int)$pdo->lastInsertId();

    $insLine = $pdo->prepare(
        'INSERT INTO project_estimate_lines
         (estimate_id, sort_order, major_category, category, item_code, item_name, quantity, unit_type, unit_price, factor, line_amount)
         SELECT
           :new_estimate_id,
           sort_order,
           major_category,
           category,
           item_code,
           item_name,
           quantity,
           unit_type,
           unit_price,
           factor,
           line_amount
         FROM project_estimate_lines
         WHERE estimate_id = :source_estimate_id'
    );
    $insLine->execute([
        ':new_estimate_id' => $newId,
        ':source_estimate_id' => $estimateId,
    ]);
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[estimate_duplicate] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '複製に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode(['success' => true, 'estimate_id' => $newId, 'estimate_number' => $newNumber], JSON_UNESCAPED_UNICODE);
