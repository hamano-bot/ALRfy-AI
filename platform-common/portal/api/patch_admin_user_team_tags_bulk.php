<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__) . '/includes/estimate_schema.php';

header('Content-Type: application/json; charset=UTF-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'PATCH') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'PATCH メソッドで実行してください。'], JSON_UNESCAPED_UNICODE);
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
    error_log('[admin_user_team_tags schema] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '初期化に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$meStmt = $pdo->prepare('SELECT is_admin FROM users WHERE id = :id LIMIT 1');
$meStmt->execute([':id' => $sessionUserId]);
$me = $meStmt->fetch(PDO::FETCH_ASSOC);
if (!is_array($me) || (int)($me['is_admin'] ?? 0) !== 1) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => '管理者権限が必要です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw = file_get_contents('php://input');
$payload = json_decode($raw !== false ? $raw : '', true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'JSON ボディが不正です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$userIds = isset($payload['user_ids']) && is_array($payload['user_ids']) ? $payload['user_ids'] : [];
$tags = isset($payload['tags']) && is_array($payload['tags']) ? $payload['tags'] : [];
$mode = isset($payload['mode']) && $payload['mode'] === 'replace' ? 'replace' : 'add';
$dryRun = isset($payload['dry_run']) && (bool)$payload['dry_run'] === true;
$confirm = isset($payload['confirm']) && (bool)$payload['confirm'] === true;

$normalizedTags = [];
foreach ($tags as $tag) {
    if (!is_string($tag)) {
        continue;
    }
    $x = strtolower(trim($tag));
    if ($x === '') {
        continue;
    }
    $normalizedTags[$x] = true;
}
$tagValues = array_keys($normalizedTags);

$idValues = [];
foreach ($userIds as $uid) {
    if (is_int($uid) || (is_string($uid) && ctype_digit($uid))) {
        $x = (int)$uid;
        if ($x > 0) {
            $idValues[$x] = true;
        }
    }
}
$targetIds = array_keys($idValues);
if ($targetIds === []) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'user_ids は必須です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$summary = [
    'target_user_count' => count($targetIds),
    'tag_count' => count($tagValues),
    'mode' => $mode,
];

if ($dryRun || !$confirm) {
    echo json_encode(['success' => true, 'dry_run' => true, 'summary' => $summary], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo->beginTransaction();
    $sel = $pdo->prepare('SELECT team FROM users WHERE id = :id LIMIT 1');
    $upd = $pdo->prepare('UPDATE users SET team = :team WHERE id = :id');
    foreach ($targetIds as $uid) {
        $sel->execute([':id' => $uid]);
        $row = $sel->fetch(PDO::FETCH_ASSOC);
        if (!is_array($row)) {
            continue;
        }
        $current = [];
        if (is_string($row['team'] ?? null) && trim((string)$row['team']) !== '') {
            $decoded = json_decode((string)$row['team'], true);
            if (is_array($decoded)) {
                foreach ($decoded as $v) {
                    if (is_string($v) && trim($v) !== '') {
                        $current[strtolower(trim($v))] = true;
                    }
                }
            }
        }
        if ($mode === 'replace') {
            $next = $normalizedTags;
        } else {
            $next = $current + $normalizedTags;
        }
        $upd->execute([':team' => json_encode(array_keys($next), JSON_UNESCAPED_UNICODE), ':id' => $uid]);
    }
    $logStmt = $pdo->prepare(
        'INSERT INTO estimate_operation_logs (estimate_id, operation_type, operator_user_id, detail_json)
         VALUES (NULL, :operation_type, :operator_user_id, :detail_json)'
    );
    $logStmt->execute([
        ':operation_type' => 'admin_bulk_user_team_tags_updated',
        ':operator_user_id' => $sessionUserId,
        ':detail_json' => json_encode(
            ['target_user_ids' => $targetIds, 'mode' => $mode, 'tags' => $tagValues, 'target_user_count' => count($targetIds)],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        ),
    ]);
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[admin_user_team_tags apply] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '一括更新に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode(['success' => true, 'summary' => $summary], JSON_UNESCAPED_UNICODE);
