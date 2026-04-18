<?php
declare(strict_types=1);

/**
 * GET/PATCH /portal/api/hearing-insight-batch-state — cron シークレットで最終バッチ時刻の取得・更新。
 */

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__) . '/includes/project_registration_schema.php';
require_once dirname(__DIR__) . '/includes/hearing_insight_schema.php';
require_once dirname(__DIR__) . '/includes/hearing_insight_cron_auth.php';

header('Content-Type: application/json; charset=UTF-8');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if (!hearingInsightCronAuthOk()) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => '認可に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = createPdoFromApplicationEnv();
} catch (Throwable $e) {
    error_log('[hearing_insight_batch_state pdo] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'データベース接続に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    ensureProjectRegistrationSchema($pdo);
    ensureHearingInsightSchema($pdo);
} catch (Throwable $e) {
    error_log('[hearing_insight_batch_state schema] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'スキーマを確認してください。'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'GET') {
    $stmt = $pdo->query('SELECT `last_run_at` FROM `hearing_insight_batch_state` WHERE `id` = 1 LIMIT 1');
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $last = null;
    if (is_array($row) && isset($row['last_run_at']) && $row['last_run_at'] !== null) {
        $last = is_string($row['last_run_at']) ? $row['last_run_at'] : null;
    }

    echo json_encode(
        [
            'success' => true,
            'last_run_at' => $last,
        ],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

if ($method === 'PATCH') {
    $raw = file_get_contents('php://input');
    $data = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($data) || !isset($data['last_run_at'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'last_run_at が必要です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $lr = $data['last_run_at'];
    if (!is_string($lr) || trim($lr) === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'last_run_at が不正です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $upd = $pdo->prepare('UPDATE `hearing_insight_batch_state` SET `last_run_at` = :lr WHERE `id` = 1');
    $upd->execute([':lr' => $lr]);

    echo json_encode(['success' => true, 'last_run_at' => $lr], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'GET または PATCH で実行してください。'], JSON_UNESCAPED_UNICODE);
