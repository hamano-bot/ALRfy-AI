<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__, 2) . '/auth/redmine_secret.php';
require_once dirname(__DIR__) . '/includes/project_registration_schema.php';
require_once dirname(__DIR__) . '/includes/redmine_http.php';
require_once dirname(__DIR__) . '/includes/user_redmine_schema.php';

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

$pidRaw = $_GET['project_id'] ?? '';
if (!is_string($pidRaw) || !ctype_digit($pidRaw)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'project_id は正の整数で指定してください。'], JSON_UNESCAPED_UNICODE);
    exit;
}
$projectId = (int)$pidRaw;
if ($projectId <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'project_id は正の整数で指定してください。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = createPdoFromApplicationEnv();
} catch (Throwable $e) {
    error_log('[platform-common/get_project_redmine_issues pdo] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'データベース接続に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    ensureProjectRegistrationSchema($pdo);
} catch (Throwable $e) {
    error_log('[platform-common/get_project_redmine_issues ensure project schema] ' . $e->getMessage());
    http_response_code(500);
    $msg = 'スキーマ（マイグレーション）を確認してください。';
    if ($e instanceof RuntimeException && str_contains($e->getMessage(), '20260417')) {
        $msg = $e->getMessage();
    }
    echo json_encode(['success' => false, 'message' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    ensureUserRedmineColumns($pdo);
} catch (Throwable $e) {
    error_log('[platform-common/get_project_redmine_issues ensure columns] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'データベースのスキーマ更新に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * @return array<string,mixed>|null
 */
function projectMemberRoleRow(PDO $pdo, int $projectId, int $userId): ?array
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

$member = projectMemberRoleRow($pdo, $projectId, $sessionUserId);
if ($member === null) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'このプロジェクトへのアクセス権限がありません。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$rStmt = $pdo->prepare(
    'SELECT redmine_project_id, redmine_base_url, redmine_project_name FROM project_redmine_links
     WHERE project_id = :pid ORDER BY sort_order ASC, id ASC'
);
$rStmt->execute([':pid' => $projectId]);
$rRows = $rStmt->fetchAll(PDO::FETCH_ASSOC);
$redmineLinks = [];
if (is_array($rRows)) {
    foreach ($rRows as $rr) {
        if (!is_array($rr)) {
            continue;
        }
        $rid = isset($rr['redmine_project_id']) ? (int)$rr['redmine_project_id'] : 0;
        if ($rid <= 0) {
            continue;
        }
        $bu = $rr['redmine_base_url'] ?? null;
        $rpn = $rr['redmine_project_name'] ?? null;
        $redmineLinks[] = [
            'redmine_project_id' => $rid,
            'redmine_base_url' => is_string($bu) && $bu !== '' ? $bu : null,
            'redmine_project_name' => is_string($rpn) && $rpn !== '' ? $rpn : null,
        ];
    }
}

if ($redmineLinks === []) {
    echo json_encode([
        'success' => true,
        'projects' => [],
        'meta' => [
            'sample_limit' => 0,
            'table_limit' => 0,
            'note' => null,
        ],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $uStmt = $pdo->prepare('SELECT redmine_base_url, redmine_api_key FROM users WHERE id = :id LIMIT 1');
    $uStmt->execute([':id' => $sessionUserId]);
    $uRow = $uStmt->fetch(PDO::FETCH_ASSOC);
} catch (Throwable $e) {
    error_log('[platform-common/get_project_redmine_issues user] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'ユーザー設定の取得に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$userBase = is_array($uRow) && isset($uRow['redmine_base_url']) && is_string($uRow['redmine_base_url']) ? trim($uRow['redmine_base_url']) : '';
$storedUserKey = is_array($uRow) && isset($uRow['redmine_api_key']) && is_string($uRow['redmine_api_key']) ? $uRow['redmine_api_key'] : null;
$userKey = platformRedmineApiKeyDecrypt($storedUserKey);

if ($userBase === '' || $userKey === '') {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'message' => 'Redmine API キーが未設定です。',
        'code' => 'redmine_not_configured',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

const SAMPLE_LIMIT = 200;
const TABLE_LIMIT = 15;

/**
 * @param array<string,mixed> $issue
 */
function redmineIssueIsClosed(array $issue): bool
{
    $st = $issue['status'] ?? null;
    if (!is_array($st)) {
        return false;
    }
    return isset($st['is_closed']) && (bool)$st['is_closed'];
}

/**
 * @param array<string,mixed> $issue
 * @return array{id: int, subject: string, status: string, priority: ?string, assigned_to: ?string, updated_on: ?string, due_date: ?string, issue_url: ?string}
 */
function normalizeIssueRow(array $issue, string $effectiveBase): array
{
    $id = isset($issue['id']) ? (int)$issue['id'] : 0;
    $sub = isset($issue['subject']) && is_string($issue['subject']) ? $issue['subject'] : '';
    $st = $issue['status'] ?? null;
    $statusName = is_array($st) && isset($st['name']) && is_string($st['name']) ? $st['name'] : '';
    $pr = $issue['priority'] ?? null;
    $prName = is_array($pr) && isset($pr['name']) && is_string($pr['name']) ? $pr['name'] : null;
    $as = $issue['assigned_to'] ?? null;
    $assignee = null;
    if (is_array($as) && isset($as['name']) && is_string($as['name']) && $as['name'] !== '') {
        $assignee = $as['name'];
    }
    $upd = isset($issue['updated_on']) && is_string($issue['updated_on']) ? $issue['updated_on'] : null;
    $due = isset($issue['due_date']) && is_string($issue['due_date']) && $issue['due_date'] !== '' ? $issue['due_date'] : null;
    $base = rtrim($effectiveBase, '/');
    $issueUrl = $id > 0 ? $base . '/issues/' . $id : null;

    return [
        'id' => $id,
        'subject' => $sub,
        'status' => $statusName,
        'priority' => $prName,
        'assigned_to' => $assignee,
        'updated_on' => $upd,
        'due_date' => $due,
        'issue_url' => $issueUrl,
    ];
}

/**
 * @param list<array<string,mixed>> $issues
 * @return array{open_in_sample: int, overdue: int, due_within_7d: int, sample_size: int}
 */
function summarizeIssues(array $issues, DateTimeImmutable $today): array
{
    $in7 = $today->modify('+7 days');
    $openIn = 0;
    $overdue = 0;
    $dueSoon = 0;
    foreach ($issues as $issue) {
        if (!is_array($issue) || redmineIssueIsClosed($issue)) {
            continue;
        }
        $openIn++;
        $dueRaw = isset($issue['due_date']) && is_string($issue['due_date']) ? $issue['due_date'] : '';
        if ($dueRaw === '') {
            continue;
        }
        $due = DateTimeImmutable::createFromFormat('Y-m-d', $dueRaw);
        if ($due === false) {
            continue;
        }
        $dueDay = $due->setTime(0, 0, 0);
        if ($dueDay < $today) {
            $overdue++;
        } elseif ($dueDay <= $in7) {
            $dueSoon++;
        }
    }

    return [
        'open_in_sample' => $openIn,
        'overdue' => $overdue,
        'due_within_7d' => $dueSoon,
        'sample_size' => count($issues),
    ];
}

$today = new DateTimeImmutable('today');
$outProjects = [];

foreach ($redmineLinks as $link) {
    $rid = $link['redmine_project_id'];
    $linkBase = $link['redmine_base_url'];
    $effectiveBase = ($linkBase !== null && $linkBase !== '') ? rtrim($linkBase, '/') : $userBase;

    $fetch = platformRedmineFetchIssuesForProject($effectiveBase, $userKey, $rid, SAMPLE_LIMIT);
    if (!$fetch['ok']) {
        $outProjects[] = [
            'redmine_project_id' => $rid,
            'redmine_project_name' => $link['redmine_project_name'],
            'redmine_base_url' => $linkBase ?? $userBase,
            'summary' => [
                'open_in_sample' => 0,
                'overdue' => 0,
                'due_within_7d' => 0,
                'sample_size' => 0,
                'total_count' => null,
            ],
            'issues' => [],
            'error' => $fetch['error'] ?? '取得に失敗しました。',
        ];
        continue;
    }

    $rawIssues = $fetch['issues'];
    $sum = summarizeIssues($rawIssues, $today);

    $openOrdered = [];
    foreach ($rawIssues as $issue) {
        if (!is_array($issue)) {
            continue;
        }
        if (redmineIssueIsClosed($issue)) {
            continue;
        }
        $openOrdered[] = $issue;
    }

    $tableRows = array_slice($openOrdered, 0, TABLE_LIMIT);
    $normalized = [];
    foreach ($tableRows as $issue) {
        if (is_array($issue)) {
            $normalized[] = normalizeIssueRow($issue, $effectiveBase);
        }
    }

    $outProjects[] = [
        'redmine_project_id' => $rid,
        'redmine_project_name' => $link['redmine_project_name'],
        'redmine_base_url' => $linkBase ?? $userBase,
        'summary' => [
            'open_in_sample' => $sum['open_in_sample'],
            'overdue' => $sum['overdue'],
            'due_within_7d' => $sum['due_within_7d'],
            'sample_size' => $sum['sample_size'],
            'total_count' => $fetch['total_count'],
        ],
        'issues' => $normalized,
        'error' => null,
    ];
}

echo json_encode([
    'success' => true,
    'projects' => $outProjects,
    'meta' => [
        'sample_limit' => SAMPLE_LIMIT,
        'table_limit' => TABLE_LIMIT,
        'note' => '集計は更新日が新しい順の最大 ' . SAMPLE_LIMIT . ' 件を対象としています。',
    ],
], JSON_UNESCAPED_UNICODE);
