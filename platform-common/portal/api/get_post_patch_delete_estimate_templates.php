<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__) . '/includes/estimate_schema.php';
require_once dirname(__DIR__) . '/includes/user_display_name_schema.php';

header('Content-Type: application/json; charset=UTF-8');

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
    ensureEstimateSchema($pdo);
    ensureUserDisplayNameColumn($pdo);
} catch (Throwable $e) {
    error_log('[estimate_templates schema] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '初期化に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * @return array<string, mixed>|null
 */
function estimateTemplateFetchRow(PDO $pdo, string $id): ?array
{
    if ($id === '' || strlen($id) > 36) {
        return null;
    }
    $stmt = $pdo->prepare(
        'SELECT t.id, t.name, t.scope, t.created_by_user_id, t.header_json, t.lines_json, t.locked,
                t.created_at, t.updated_at,
                u.email AS creator_email,
                u.display_name AS creator_display_name
         FROM estimate_templates t
         INNER JOIN users u ON u.id = t.created_by_user_id
         WHERE t.id = :id
         LIMIT 1'
    );
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return is_array($row) ? $row : null;
}

function portalSessionIsAdmin(PDO $pdo, int $userId): bool
{
    if ($userId <= 0) {
        return false;
    }
    try {
        $stmt = $pdo->prepare('SELECT is_admin FROM users WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $userId]);
        $v = $stmt->fetchColumn();
        return is_scalar($v) && (int)$v === 1;
    } catch (Throwable $e) {
        return false;
    }
}

/**
 * @param array<string, mixed> $row
 * @return array<string, mixed>
 */
function estimateTemplateRowToListItem(array $row): array
{
    $dnRaw = $row['creator_display_name'] ?? null;
    $dn = is_string($dnRaw) ? trim($dnRaw) : '';
    $hj = $row['header_json'] ?? '{}';
    $lj = $row['lines_json'] ?? '[]';
    return [
        'id' => (string)($row['id'] ?? ''),
        'name' => (string)($row['name'] ?? ''),
        'scope' => (string)($row['scope'] ?? 'private'),
        'created_by_user_id' => (int)($row['created_by_user_id'] ?? 0),
        'locked' => (int)($row['locked'] ?? 0) === 1,
        'header_json' => is_string($hj) ? $hj : '{}',
        'lines_json' => is_string($lj) ? $lj : '[]',
        'created_at' => (string)($row['created_at'] ?? ''),
        'updated_at' => (string)($row['updated_at'] ?? ''),
        'creator_email' => (string)($row['creator_email'] ?? ''),
        'creator_display_name' => $dn !== '' ? $dn : null,
    ];
}

$isAdmin = portalSessionIsAdmin($pdo, $sessionUserId);

if ($method === 'GET') {
    $stmt = $pdo->prepare(
        "SELECT t.id, t.name, t.scope, t.created_by_user_id, t.header_json, t.lines_json, t.locked,
                t.created_at, t.updated_at,
                u.email AS creator_email,
                u.display_name AS creator_display_name
         FROM estimate_templates t
         INNER JOIN users u ON u.id = t.created_by_user_id
         WHERE t.scope = 'shared' OR t.created_by_user_id = :uid
         ORDER BY t.updated_at DESC"
    );
    $stmt->execute([':uid' => $sessionUserId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $out = [];
    if (is_array($rows)) {
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $out[] = estimateTemplateRowToListItem($row);
        }
    }
    echo json_encode(
        [
            'success' => true,
            'templates' => $out,
            'viewer' => ['is_admin' => $isAdmin],
        ],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
    );
    exit;
}

if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw !== false ? $raw : '', true);
    if (!is_array($payload)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'JSON ボディが不正です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $name = isset($payload['name']) && is_string($payload['name']) ? trim($payload['name']) : '';
    if ($name === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'name は必須です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $scope = (isset($payload['scope']) && $payload['scope'] === 'shared') ? 'shared' : 'private';
    if ($scope === 'shared' && !$isAdmin) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => '全体テンプレートの保存には管理者権限が必要です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $headerJson = json_encode($payload['header'] ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $linesJson = json_encode($payload['lines'] ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $id = estimateNewUuid();
    $ins = $pdo->prepare(
        'INSERT INTO estimate_templates (id, name, scope, created_by_user_id, header_json, lines_json, locked)
         VALUES (:id, :name, :scope, :uid, :header_json, :lines_json, 0)'
    );
    try {
        $ins->execute([
            ':id' => $id,
            ':name' => $name,
            ':scope' => $scope,
            ':uid' => $sessionUserId,
            ':header_json' => $headerJson !== false ? $headerJson : '{}',
            ':lines_json' => $linesJson !== false ? $linesJson : '[]',
        ]);
    } catch (Throwable $e) {
        error_log('[estimate_templates POST] ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'テンプレートの保存に失敗しました（DB）。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo json_encode(['success' => true, 'id' => $id], JSON_UNESCAPED_UNICODE);
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
    $id = isset($payload['id']) && is_string($payload['id']) ? trim($payload['id']) : '';
    if ($id === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'id は必須です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $row = estimateTemplateFetchRow($pdo, $id);
    if ($row === null) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'テンプレートが見つかりません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $scope = (string)($row['scope'] ?? 'private');
    $creatorId = (int)($row['created_by_user_id'] ?? 0);

    $hasName = array_key_exists('name', $payload);
    $hasHeader = array_key_exists('header', $payload);
    $hasLines = array_key_exists('lines', $payload);
    $hasScope = array_key_exists('scope', $payload);
    $hasLocked = array_key_exists('locked', $payload);

    if ($scope === 'shared') {
        if (!$isAdmin) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => '全体テンプレートの更新には管理者権限が必要です。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
    } elseif ($creatorId !== $sessionUserId) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => '編集権限がありません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $name = null;
    if ($hasName) {
        if (!is_string($payload['name'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'name が不正です。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $name = trim($payload['name']);
        if ($name === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'name は空にできません。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    $newScope = null;
    if ($hasScope) {
        $newScope = (isset($payload['scope']) && $payload['scope'] === 'shared') ? 'shared' : 'private';
        if ($newScope === 'shared' && !$isAdmin) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => '全体テンプレートへの変更には管理者権限が必要です。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($scope === 'shared' && $newScope === 'private' && !$isAdmin) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => '全体テンプレートの公開範囲変更は管理者のみです。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    $headerJson = null;
    if ($hasHeader) {
        $headerJson = json_encode($payload['header'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($headerJson === false) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'header を JSON にできません。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    $linesJson = null;
    if ($hasLines) {
        $linesJson = json_encode($payload['lines'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($linesJson === false) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'lines を JSON にできません。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    $lockedVal = null;
    if ($hasLocked) {
        $lk = $payload['locked'];
        if (!is_bool($lk) && $lk !== 0 && $lk !== 1 && $lk !== '0' && $lk !== '1') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'locked は真偽値で指定してください。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $lockedVal = ($lk === true || $lk === 1 || $lk === '1') ? 1 : 0;
    }

    if (!$hasName && !$hasHeader && !$hasLines && !$hasScope && !$hasLocked) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => '更新するフィールドを指定してください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $upd = $pdo->prepare(
        'UPDATE estimate_templates
         SET name = COALESCE(:name, name),
             header_json = COALESCE(:header_json, header_json),
             lines_json = COALESCE(:lines_json, lines_json),
             scope = COALESCE(:scope, scope),
             locked = COALESCE(:locked, locked)
         WHERE id = :id'
    );
    $upd->execute([
        ':name' => $name,
        ':header_json' => $headerJson,
        ':lines_json' => $linesJson,
        ':scope' => $newScope,
        ':locked' => $lockedVal,
        ':id' => $id,
    ]);
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'DELETE') {
    $id = isset($_GET['id']) && is_string($_GET['id']) ? trim($_GET['id']) : '';
    if ($id === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'id は必須です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $row = estimateTemplateFetchRow($pdo, $id);
    if ($row === null) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'テンプレートが見つかりません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $scope = (string)($row['scope'] ?? 'private');
    $creatorId = (int)($row['created_by_user_id'] ?? 0);

    if ($scope === 'shared') {
        if (!$isAdmin) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => '全体テンプレートの削除には管理者権限が必要です。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
    } elseif ($creatorId !== $sessionUserId) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => '削除権限がありません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ((int)($row['locked'] ?? 0) === 1) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'ロック中のため削除できません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $pdo->prepare('DELETE FROM estimate_templates WHERE id = :id')->execute([':id' => $id]);
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'GET / POST / PATCH / DELETE で実行してください。'], JSON_UNESCAPED_UNICODE);
