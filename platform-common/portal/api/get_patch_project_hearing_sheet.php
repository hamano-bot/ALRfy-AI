<?php
declare(strict_types=1);

/**
 * GET/PATCH /portal/api/project-hearing-sheet
 * 案件に 1:1 のヒアリングシート（body_json + status）。
 */

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__) . '/includes/project_registration_schema.php';

header('Content-Type: application/json; charset=UTF-8');

const HEARING_BODY_JSON_MAX_BYTES = 2097152; // 2 MiB

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
    error_log('[platform-common/get_patch_project_hearing_sheet pdo] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'データベース接続に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    ensureProjectRegistrationSchema($pdo);
} catch (Throwable $e) {
    error_log('[platform-common/get_patch_project_hearing_sheet ensure schema] ' . $e->getMessage());
    http_response_code(500);
    $msg = 'スキーマ（マイグレーション）を確認してください。';
    if ($e instanceof RuntimeException && str_contains($e->getMessage(), '20260417')) {
        $msg = $e->getMessage();
    }
    echo json_encode(['success' => false, 'message' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * @return string|null viewer|editor|owner|null if not member
 */
function hearingSheetProjectMemberRole(PDO $pdo, int $projectId, int $userId): ?string
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
 * @return array{project_id:int,status:string,body_json:mixed}|null
 */
function fetchHearingSheetRow(PDO $pdo, int $projectId): ?array
{
    $stmt = $pdo->prepare(
        'SELECT project_id, status, body_json FROM project_hearing_sheets WHERE project_id = :pid LIMIT 1'
    );
    $stmt->execute([':pid' => $projectId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row === false || !is_array($row)) {
        return null;
    }
    $pid = isset($row['project_id']) ? (int)$row['project_id'] : 0;
    $st = isset($row['status']) && is_string($row['status']) ? $row['status'] : 'draft';
    $raw = $row['body_json'] ?? '';
    $decoded = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($decoded)) {
        $decoded = [];
    }
    return [
        'project_id' => $pid,
        'status' => $st,
        'body_json' => $decoded,
    ];
}

/** @param mixed $v */
function validateStatusValue($v): ?string
{
    if (!is_string($v)) {
        return null;
    }
    return match ($v) {
        'draft', 'finalized', 'archived' => $v,
        default => null,
    };
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

    $role = hearingSheetProjectMemberRole($pdo, $projectId, $sessionUserId);
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

    $row = fetchHearingSheetRow($pdo, $projectId);
    if ($row === null) {
        $row = [
            'project_id' => $projectId,
            'status' => 'draft',
            'body_json' => [],
        ];
    }

    echo json_encode(
        [
            'success' => true,
            'hearing_sheet' => [
                'project_id' => $row['project_id'],
                'status' => $row['status'],
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

    $memberRole = hearingSheetProjectMemberRole($pdo, $projectId, $sessionUserId);
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

    $hasBody = array_key_exists('body_json', $payload);
    $hasStatus = array_key_exists('status', $payload);

    if (!$hasBody && !$hasStatus) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'body_json または status のいずれかを指定してください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $current = fetchHearingSheetRow($pdo, $projectId);

    $nextBody = $current !== null ? $current['body_json'] : [];
    if ($hasBody) {
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
    }

    $nextStatus = $current !== null ? $current['status'] : 'draft';
    if ($hasStatus) {
        $sv = validateStatusValue($payload['status']);
        if ($sv === null) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'status は draft / finalized / archived のいずれかにしてください。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $nextStatus = $sv;
    }

    $encoded = json_encode($nextBody, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'body_json を JSON にできません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if (strlen($encoded) > HEARING_BODY_JSON_MAX_BYTES) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'body_json が大きすぎます。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    try {
        if ($current === null) {
            $ins = $pdo->prepare(
                'INSERT INTO project_hearing_sheets (project_id, status, body_json) VALUES (:pid, :st, :bj)'
            );
            $ins->execute([
                ':pid' => $projectId,
                ':st' => $nextStatus,
                ':bj' => $encoded,
            ]);
        } else {
            $upd = $pdo->prepare(
                'UPDATE project_hearing_sheets SET status = :st, body_json = :bj WHERE project_id = :pid'
            );
            $upd->execute([
                ':st' => $nextStatus,
                ':bj' => $encoded,
                ':pid' => $projectId,
            ]);
        }
    } catch (Throwable $e) {
        error_log('[platform-common/patch_project_hearing_sheet] ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'ヒアリングシートの更新に失敗しました。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $out = fetchHearingSheetRow($pdo, $projectId);
    if ($out === null) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => '更新後の取得に失敗しました。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode(
        [
            'success' => true,
            'hearing_sheet' => [
                'project_id' => $out['project_id'],
                'status' => $out['status'],
                'body_json' => $out['body_json'],
            ],
        ],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'GET または PATCH メソッドで実行してください。'], JSON_UNESCAPED_UNICODE);
