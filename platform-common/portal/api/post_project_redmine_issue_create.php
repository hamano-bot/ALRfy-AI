<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__) . '/includes/project_registration_schema.php';
require_once dirname(__DIR__) . '/includes/redmine_http.php';
require_once dirname(__DIR__) . '/includes/user_redmine_schema.php';

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
if ($sessionUserId <= 0) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'ログインが必要です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$rawBody = file_get_contents('php://input');
if (!is_string($rawBody) || $rawBody === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'JSON ボディが空です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$payload = json_decode($rawBody, true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'JSON が不正です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$projectIdRaw = $payload['project_id'] ?? null;
$redmineProjectIdRaw = $payload['redmine_project_id'] ?? null;
$subject = isset($payload['subject']) && is_string($payload['subject']) ? $payload['subject'] : '';
$description = isset($payload['description']) && is_string($payload['description']) ? $payload['description'] : '';
$dueDate = isset($payload['due_date']) && is_string($payload['due_date']) ? trim($payload['due_date']) : '';

if (!is_int($projectIdRaw) && !(is_string($projectIdRaw) && ctype_digit($projectIdRaw))) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'project_id が不正です。'], JSON_UNESCAPED_UNICODE);
    exit;
}
$projectId = (int)$projectIdRaw;
if ($projectId <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'project_id が不正です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!is_int($redmineProjectIdRaw) && !(is_string($redmineProjectIdRaw) && ctype_digit($redmineProjectIdRaw))) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'redmine_project_id が不正です。'], JSON_UNESCAPED_UNICODE);
    exit;
}
$redmineProjectId = (int)$redmineProjectIdRaw;
if ($redmineProjectId <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'redmine_project_id が不正です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$subject = trim($subject);
if ($subject === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'subject は必須です。'], JSON_UNESCAPED_UNICODE);
    exit;
}
if (mb_strlen($subject) > 255) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'subject が長すぎます。'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (mb_strlen($description) > 200000) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'description が長すぎます。'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($dueDate !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dueDate)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'due_date は YYYY-MM-DD 形式で指定してください。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = createPdoFromApplicationEnv();
} catch (Throwable $e) {
    error_log('[platform-common/post_project_redmine_issue_create pdo] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'データベース接続に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    ensureProjectRegistrationSchema($pdo);
} catch (Throwable $e) {
    error_log('[platform-common/post_project_redmine_issue_create ensure project schema] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'スキーマ（マイグレーション）を確認してください。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    ensureUserRedmineColumns($pdo);
} catch (Throwable $e) {
    error_log('[platform-common/post_project_redmine_issue_create ensure columns] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'データベースのスキーマ更新に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * @return array<string,mixed>|null
 */
function projectMemberRoleRowIssueCreate(PDO $pdo, int $projectId, int $userId): ?array
{
    $stmt = $pdo->prepare(
        'SELECT role FROM project_members WHERE project_id = :pid AND user_id = :uid LIMIT 1'
    );
    $stmt->execute([':pid' => $projectId, ':uid' => $userId]);
    $r = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($r === false || !is_array($r)) {
        return null;
    }
    $role = $r['role'] ?? '';
    return is_string($role) && $role !== '' ? ['role' => $role] : null;
}

$member = projectMemberRoleRowIssueCreate($pdo, $projectId, $sessionUserId);
if ($member === null) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'このプロジェクトへのアクセス権限がありません。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$rStmt = $pdo->prepare(
    'SELECT redmine_project_id, redmine_base_url FROM project_redmine_links
     WHERE project_id = :pid AND redmine_project_id = :rid LIMIT 1'
);
$rStmt->execute([':pid' => $projectId, ':rid' => $redmineProjectId]);
$linkRow = $rStmt->fetch(PDO::FETCH_ASSOC);
if ($linkRow === false || !is_array($linkRow)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => '指定された Redmine プロジェクトはこの案件に紐づいていません。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$linkBase = $linkRow['redmine_base_url'] ?? null;
$linkBaseStr = is_string($linkBase) ? trim($linkBase) : '';

try {
    $uStmt = $pdo->prepare('SELECT redmine_base_url, redmine_api_key FROM users WHERE id = :id LIMIT 1');
    $uStmt->execute([':id' => $sessionUserId]);
    $uRow = $uStmt->fetch(PDO::FETCH_ASSOC);
} catch (Throwable $e) {
    error_log('[platform-common/post_project_redmine_issue_create user] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'ユーザー設定の取得に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$userBase = is_array($uRow) && isset($uRow['redmine_base_url']) && is_string($uRow['redmine_base_url']) ? trim($uRow['redmine_base_url']) : '';
$userKey = is_array($uRow) && isset($uRow['redmine_api_key']) && is_string($uRow['redmine_api_key']) ? trim($uRow['redmine_api_key']) : '';

if ($userBase === '' || $userKey === '') {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'message' => 'Redmine API キーが未設定です。',
        'code' => 'redmine_not_configured',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$effectiveBase = $linkBaseStr !== '' ? rtrim($linkBaseStr, '/') : $userBase;

$issueFields = [
    'project_id' => $redmineProjectId,
    'subject' => $subject,
];
if ($description !== '') {
    $issueFields['description'] = $description;
}
if ($dueDate !== '') {
    $issueFields['due_date'] = $dueDate;
}

$assigneeId = platformRedmineGetCurrentUserId($effectiveBase, $userKey);
if ($assigneeId > 0) {
    $issueFields['assigned_to_id'] = $assigneeId;
}

$create = platformRedmineCreateIssue($effectiveBase, $userKey, $issueFields);
if (!$create['ok'] || $create['issue'] === null) {
    $msg = $create['error'] ?? 'チケットの作成に失敗しました。';
    $code = $create['http_code'];
    if ($code === 401 || $code === 403) {
        http_response_code(403);
    } elseif ($code === 422) {
        http_response_code(422);
    } elseif ($code >= 400 && $code < 500) {
        http_response_code(400);
    } else {
        http_response_code(502);
    }
    echo json_encode([
        'success' => false,
        'message' => $msg,
        'code' => 'redmine_create_failed',
        'http_code' => $code,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$issue = $create['issue'];
$id = isset($issue['id']) ? (int)$issue['id'] : 0;
$subj = isset($issue['subject']) && is_string($issue['subject']) ? $issue['subject'] : $subject;
$base = rtrim($effectiveBase, '/');
$issueUrl = $id > 0 ? $base . '/issues/' . $id : null;

echo json_encode([
    'success' => true,
    'issue' => [
        'id' => $id,
        'subject' => $subj,
        'issue_url' => $issueUrl,
    ],
    'redmine_base_url_used' => $effectiveBase,
], JSON_UNESCAPED_UNICODE);
