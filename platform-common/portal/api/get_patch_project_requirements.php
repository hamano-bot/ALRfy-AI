<?php
declare(strict_types=1);

/**
 * GET/PATCH /portal/api/project-requirements
 * 案件に 1:1 の要件定義（body_json のみ）。
 */

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__) . '/includes/project_registration_schema.php';

header('Content-Type: application/json; charset=UTF-8');

const REQUIREMENTS_BODY_JSON_MAX_BYTES = 2097152; // 2 MiB

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

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

try {
    $pdo = createPdoFromApplicationEnv();
} catch (Throwable $e) {
    error_log('[platform-common/get_patch_project_requirements pdo] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'データベース接続に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    ensureProjectRegistrationSchema($pdo);
} catch (Throwable $e) {
    error_log('[platform-common/get_patch_project_requirements ensure schema] ' . $e->getMessage());
    http_response_code(500);
    $msg = 'スキーマ（マイグレーション）を確認してください。';
    echo json_encode(['success' => false, 'message' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * @return string|null viewer|editor|owner|null if not member
 */
function requirementsProjectMemberRole(PDO $pdo, int $projectId, int $userId): ?string
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
    return is_string($role) && $role !== '' ? $role : null;
}

/**
 * @return array{project_id:int,body_json:mixed}|null
 */
function fetchRequirementsRow(PDO $pdo, int $projectId): ?array
{
    $stmt = $pdo->prepare(
        'SELECT project_id, body_json FROM project_requirements WHERE project_id = :pid LIMIT 1'
    );
    $stmt->execute([':pid' => $projectId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row === false || !is_array($row)) {
        return null;
    }
    $pid = isset($row['project_id']) ? (int)$row['project_id'] : 0;
    $raw = $row['body_json'] ?? '';
    $decoded = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($decoded)) {
        $decoded = [];
    }
    return [
        'project_id' => $pid,
        'body_json' => $decoded,
    ];
}

if ($method === 'GET') {
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

    $role = requirementsProjectMemberRole($pdo, $projectId, $sessionUserId);
    if ($role === null) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'このプロジェクトへのアクセス権限がありません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $exists = $pdo->prepare('SELECT id FROM projects WHERE id = :id LIMIT 1');
    $exists->execute([':id' => $projectId]);
    if ($exists->fetch() === false) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'プロジェクトが見つかりません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $row = fetchRequirementsRow($pdo, $projectId);
    if ($row === null) {
        $row = [
            'project_id' => $projectId,
            'body_json' => [],
        ];
    }

    echo json_encode(
        [
            'success' => true,
            'requirements' => [
                'project_id' => $row['project_id'],
                'body_json' => $row['body_json'],
            ],
        ],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

if ($method === 'PATCH') {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw !== false ? $raw : '', true);
    if (!is_array($payload)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'JSON ボディが不正です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $projectId = $payload['project_id'] ?? null;
    if (!is_int($projectId) && !(is_string($projectId) && ctype_digit((string)$projectId))) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'project_id は必須です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $projectId = (int)$projectId;
    if ($projectId <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'project_id は正の整数にしてください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $memberRole = requirementsProjectMemberRole($pdo, $projectId, $sessionUserId);
    if ($memberRole === null) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'このプロジェクトへのアクセス権限がありません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($memberRole !== 'owner' && $memberRole !== 'editor') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => '編集権限がありません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $exists = $pdo->prepare('SELECT id FROM projects WHERE id = :id LIMIT 1');
    $exists->execute([':id' => $projectId]);
    if ($exists->fetch() === false) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'プロジェクトが見つかりません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (!array_key_exists('body_json', $payload)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'body_json を指定してください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $bj = $payload['body_json'];
    if ($bj === null) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'body_json はオブジェクトまたは配列にしてください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if (!is_array($bj)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'body_json は JSON オブジェクトまたは配列にしてください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $nextBody = $bj;

    $encoded = json_encode($nextBody, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'body_json を JSON にできません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if (strlen($encoded) > REQUIREMENTS_BODY_JSON_MAX_BYTES) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'body_json が大きすぎます。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $current = fetchRequirementsRow($pdo, $projectId);

    try {
        if ($current === null) {
            $ins = $pdo->prepare(
                'INSERT INTO project_requirements (project_id, body_json) VALUES (:pid, :bj)'
            );
            $ins->execute([
                ':pid' => $projectId,
                ':bj' => $encoded,
            ]);
        } else {
            $upd = $pdo->prepare(
                'UPDATE project_requirements SET body_json = :bj WHERE project_id = :pid'
            );
            $upd->execute([
                ':bj' => $encoded,
                ':pid' => $projectId,
            ]);
        }
    } catch (Throwable $e) {
        error_log('[platform-common/patch_project_requirements] ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => '要件定義の更新に失敗しました。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $out = fetchRequirementsRow($pdo, $projectId);
    if ($out === null) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => '更新後の取得に失敗しました。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode(
        [
            'success' => true,
            'requirements' => [
                'project_id' => $out['project_id'],
                'body_json' => $out['body_json'],
            ],
        ],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'GET または PATCH メソッドで実行してください。'], JSON_UNESCAPED_UNICODE);
