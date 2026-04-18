<?php
declare(strict_types=1);

/**
 * GET /portal/api/hearing-insight-export?since=&template_id=
 * 解析行のうち、ヒアリングシート更新が since より後の案件に紐づくもの（cron）。
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

$since = isset($_GET['since']) && is_string($_GET['since']) ? trim($_GET['since']) : '1970-01-01 00:00:00';
$templateId = isset($_GET['template_id']) && is_string($_GET['template_id']) ? trim($_GET['template_id']) : '';
if ($templateId === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'template_id が必要です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = createPdoFromApplicationEnv();
} catch (Throwable $e) {
    error_log('[get_hearing_insight_export pdo] ' . $e->getMessage());
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

$sql = 'SELECT ai.`project_id`, ai.`item_id`, ai.`resolved_template_id`, ai.`category`, ai.`heading`, ai.`question`,
               ai.`excluded_reason`, ai.`ingested_at`, phs.`updated_at` AS `sheet_updated_at`
        FROM `hearing_analytics_items` ai
        INNER JOIN `project_hearing_sheets` phs ON phs.`project_id` = ai.`project_id`
        WHERE ai.`excluded_reason` IS NULL
          AND ai.`resolved_template_id` = :tid
          AND phs.`updated_at` > :since
        ORDER BY ai.`project_id`, ai.`item_id`';

$stmt = $pdo->prepare($sql);
$stmt->execute([':tid' => $templateId, ':since' => $since]);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo json_encode(
    [
        'success' => true,
        'template_id' => $templateId,
        'since' => $since,
        'rows' => $rows,
    ],
    JSON_UNESCAPED_UNICODE
);
