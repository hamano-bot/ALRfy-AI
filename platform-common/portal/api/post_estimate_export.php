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

$raw = file_get_contents('php://input');
$payload = json_decode($raw !== false ? $raw : '', true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'JSON ボディが不正です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$format = isset($payload['format']) && is_string($payload['format']) ? strtolower(trim($payload['format'])) : 'pdf';
if ($format !== 'pdf' && $format !== 'excel') {
    $format = 'pdf';
}

if (!isset($payload['estimate_id']) || !is_numeric($payload['estimate_id'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'estimate_id は必須です。'], JSON_UNESCAPED_UNICODE);
    exit;
}
$estimateId = (int)$payload['estimate_id'];

try {
    $pdo = createPdoFromApplicationEnv();
    ensureEstimateSchema($pdo);
} catch (Throwable $e) {
    error_log('[estimate_export schema] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '初期化に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$stmt = $pdo->prepare('SELECT estimate_number, title, subtotal_excluding_tax, tax_amount, total_including_tax FROM project_estimates WHERE id = :id LIMIT 1');
$stmt->execute([':id' => $estimateId]);
$estimate = $stmt->fetch(PDO::FETCH_ASSOC);
if (!is_array($estimate)) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => '見積が見つかりません。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$lineStmt = $pdo->prepare('SELECT item_name, quantity, unit_type, unit_price, line_amount FROM project_estimate_lines WHERE estimate_id = :id ORDER BY sort_order ASC, id ASC');
$lineStmt->execute([':id' => $estimateId]);
$lines = $lineStmt->fetchAll(PDO::FETCH_ASSOC);
if (!is_array($lines)) {
    $lines = [];
}
$overflow = count($lines) > 18;

if ($format === 'excel') {
    http_response_code(410);
    echo json_encode([
        'success' => false,
        'message' => 'Excel は Next の POST /api/portal/estimate-export-xlsx（.xlsx）を使用してください。CSV は廃止しました。',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// PDF: Phase1 では HTMLベース文字列を返し、BFF/フロントで印刷保存を行う。
$pdfLikeHtml = '<html><body><h1>' . htmlspecialchars((string)($estimate['title'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</h1>'
    . '<p>見積番号: ' . htmlspecialchars((string)($estimate['estimate_number'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</p>'
    . '<p>税抜: ' . htmlspecialchars((string)($estimate['subtotal_excluding_tax'] ?? 0), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</p>'
    . '<p>消費税: ' . htmlspecialchars((string)($estimate['tax_amount'] ?? 0), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</p>'
    . '<p>税込合計: ' . htmlspecialchars((string)($estimate['total_including_tax'] ?? 0), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</p>'
    . '</body></html>';

echo json_encode([
    'success' => true,
    'format' => 'pdf',
    'filename' => (string)($estimate['estimate_number'] ?? 'estimate') . '.html',
    'html' => $pdfLikeHtml,
    'a4_overflow_warning' => $overflow,
], JSON_UNESCAPED_UNICODE);
