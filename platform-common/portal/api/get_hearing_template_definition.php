<?php
declare(strict_types=1);

/**
 * GET /portal/api/hearing-template-definition?template_id=
 * 公開テンプレ定義（cron または将来のフロント seed 用）。
 */

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__) . '/includes/project_registration_schema.php';
require_once dirname(__DIR__) . '/includes/hearing_insight_schema.php';
require_once dirname(__DIR__) . '/includes/hearing_insight_cron_auth.php';

header('Content-Type: application/json; charset=UTF-8');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'GET のみです。'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!hearingInsightCronAuthOk()) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => '認可に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$templateId = isset($_GET['template_id']) && is_string($_GET['template_id']) ? trim($_GET['template_id']) : '';
if ($templateId === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'template_id が必要です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = createPdoFromApplicationEnv();
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'データベース接続に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    ensureProjectRegistrationSchema($pdo);
    ensureHearingInsightSchema($pdo);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'スキーマを確認してください。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$stmt = $pdo->prepare(
    'SELECT `template_id`, `version`, `items_json`, `updated_at` FROM `hearing_template_definitions` WHERE `template_id` = :tid LIMIT 1'
);
$stmt->execute([':tid' => $templateId]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);
if ($row === false || !is_array($row)) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'テンプレ定義がありません。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$decoded = json_decode((string) $row['items_json'], true);
if (!is_array($decoded)) {
    $decoded = ['template_id' => $templateId, 'items' => []];
}

echo json_encode(
    [
        'success' => true,
        'template_id' => $row['template_id'],
        'version' => (int) $row['version'],
        'body_json' => $decoded,
        'updated_at' => $row['updated_at'] ?? null,
    ],
    JSON_UNESCAPED_UNICODE
);
