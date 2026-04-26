<?php
declare(strict_types=1);

/**
 * ログインユーザが閲覧可能な見積のうち、client_name が一致し client_abbr が入っている最新行の略称を返す。
 * 編集画面で略称（見積用）の自動連動に使用。
 */
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

$sessionUserId = (int)$_SESSION['user_id'];
if ($sessionUserId <= 0) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'ログインが必要です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$clientNameRaw = isset($_GET['client_name']) && is_string($_GET['client_name']) ? trim($_GET['client_name']) : '';
if ($clientNameRaw === '') {
    echo json_encode(['success' => true, 'client_abbr' => null], JSON_UNESCAPED_UNICODE);
    exit;
}
if (mb_strlen($clientNameRaw, 'UTF-8') > 255) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'client_name は 255 文字以内にしてください。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = createPdoFromApplicationEnv();
    ensureEstimateSchema($pdo);
} catch (Throwable $e) {
    error_log('[estimate_client_abbr_lookup schema] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '初期化に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$teamTags = [];
try {
    $userStmt = $pdo->prepare('SELECT team FROM users WHERE id = :id LIMIT 1');
    $userStmt->execute([':id' => $sessionUserId]);
    $u = $userStmt->fetch(PDO::FETCH_ASSOC);
    if (is_array($u) && is_string($u['team'] ?? null) && trim($u['team']) !== '') {
        $decoded = json_decode((string)$u['team'], true);
        if (is_array($decoded)) {
            foreach ($decoded as $tag) {
                if (is_string($tag) && trim($tag) !== '') {
                    $teamTags[strtolower(trim($tag))] = true;
                }
            }
        }
    }
} catch (Throwable $e) {
    error_log('[estimate_client_abbr_lookup team tags] ' . $e->getMessage());
}

$permOr = [];
$permOr[] = "pe.visibility_scope = 'public_all_users'";
$permOr[] = 'pe.created_by_user_id = :session_user_id_created';
$permOr[] = 'EXISTS (SELECT 1 FROM estimate_user_permissions eup WHERE eup.estimate_id = pe.id AND eup.user_id = :session_user_id_perm)';
$params = [
    ':session_user_id_created' => $sessionUserId,
    ':session_user_id_perm' => $sessionUserId,
    ':client_name' => $clientNameRaw,
];
if (!empty($teamTags)) {
    $tagPlaceholders = [];
    $i = 0;
    foreach (array_keys($teamTags) as $tag) {
        $ph = ':perm_team_tag_' . $i;
        $tagPlaceholders[] = $ph;
        $params[$ph] = $tag;
        $i++;
    }
    $permOr[] = 'EXISTS (SELECT 1 FROM estimate_team_permissions etp2 WHERE etp2.estimate_id = pe.id AND etp2.team_tag IN (' . implode(',', $tagPlaceholders) . '))';
}
$permSql = '(' . implode(' OR ', $permOr) . ')';

$sql =
    'SELECT pe.client_abbr FROM project_estimates pe
     WHERE pe.client_name = :client_name
       AND pe.client_abbr IS NOT NULL
       AND CHAR_LENGTH(TRIM(pe.client_abbr)) > 0
       AND ' . $permSql . '
     ORDER BY pe.updated_at DESC, pe.id DESC
     LIMIT 1';

try {
    $stmt = $pdo->prepare($sql);
    foreach ($params as $k => $v) {
        $stmt->bindValue($k, $v);
    }
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
} catch (Throwable $e) {
    error_log('[estimate_client_abbr_lookup query] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '検索に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$abbr = null;
if (is_array($row) && isset($row['client_abbr']) && is_string($row['client_abbr'])) {
    $t = trim($row['client_abbr']);
    if ($t !== '') {
        $abbr = $t;
    }
}

echo json_encode(['success' => true, 'client_abbr' => $abbr], JSON_UNESCAPED_UNICODE);
