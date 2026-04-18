<?php
declare(strict_types=1);

/**
 * GET /portal/api/system-update-events — ログインユーザー向け更新イベント一覧。
 */

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__) . '/includes/project_registration_schema.php';
require_once dirname(__DIR__) . '/includes/hearing_insight_schema.php';

header('Content-Type: application/json; charset=UTF-8');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'GET のみです。'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!isset($_SESSION['user_id']) || (int) $_SESSION['user_id'] <= 0) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'ログインが必要です。'], JSON_UNESCAPED_UNICODE);
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

$limit = 100;
if (isset($_GET['limit']) && is_string($_GET['limit']) && ctype_digit($_GET['limit'])) {
    $n = (int) $_GET['limit'];
    if ($n > 0 && $n <= 200) {
        $limit = $n;
    }
}

$stmt = $pdo->prepare(
    'SELECT `id`, `occurred_at`, `kind`, `title`, `template_id`, `template_version_before`, `template_version_after`,
            `detail_json`, `summary`
     FROM `system_update_events`
     ORDER BY `occurred_at` DESC, `id` DESC
     LIMIT ?'
);
$stmt->bindValue(1, $limit, PDO::PARAM_INT);
$stmt->execute();
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$out = [];
foreach ($rows as $r) {
    if (!is_array($r)) {
        continue;
    }
    $dj = $r['detail_json'] ?? '';
    $decoded = is_string($dj) && $dj !== '' ? json_decode($dj, true) : null;
    $out[] = [
        'id' => isset($r['id']) ? (string) $r['id'] : '',
        'datetime' => isset($r['occurred_at']) && is_string($r['occurred_at']) ? $r['occurred_at'] : '',
        'kind' => isset($r['kind']) && is_string($r['kind']) ? $r['kind'] : 'template',
        'title' => isset($r['title']) && is_string($r['title']) ? $r['title'] : '',
        'summary' => isset($r['summary']) && is_string($r['summary']) ? $r['summary'] : '',
        'template_id' => isset($r['template_id']) && is_string($r['template_id']) ? $r['template_id'] : null,
        'template_version_before' => isset($r['template_version_before']) ? (int) $r['template_version_before'] : null,
        'template_version_after' => isset($r['template_version_after']) ? (int) $r['template_version_after'] : null,
        'detail' => is_array($decoded) ? $decoded : null,
    ];
}

echo json_encode(['success' => true, 'events' => $out], JSON_UNESCAPED_UNICODE);
