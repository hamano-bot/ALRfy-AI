<?php
declare(strict_types=1);

/**
 * GET/POST/PATCH/DELETE /portal/api/requirements-editor-templates
 * 要件エディタ用テンプレート（ログインユーザ全体の public + 自分の private）。
 */

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__) . '/includes/project_registration_schema.php';
require_once dirname(__DIR__) . '/includes/user_display_name_schema.php';

header('Content-Type: application/json; charset=UTF-8');

const REQ_TEMPLATES_DOC_MAX_BYTES = 2097152; // 2 MiB

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
    error_log('[platform-common/requirements_editor_templates pdo] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'データベース接続に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    ensureUserDisplayNameColumn($pdo);
    ensureProjectRegistrationSchema($pdo);
} catch (Throwable $e) {
    error_log('[platform-common/requirements_editor_templates ensure schema] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'スキーマ（マイグレーション）を確認してください。'], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * @return non-empty-string
 */
function requirementsEditorTemplateNewId(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr(ord($bytes[6]) & 0x0f | 0x40);
    $bytes[8] = chr(ord($bytes[8]) & 0x3f | 0x80);
    $hex = bin2hex($bytes);
    return sprintf(
        '%s-%s-%s-%s-%s',
        substr($hex, 0, 8),
        substr($hex, 8, 4),
        substr($hex, 12, 4),
        substr($hex, 16, 4),
        substr($hex, 20, 12)
    );
}

/**
 * @return array<string, mixed>|null
 */
function fetchRequirementsTemplateById(PDO $pdo, string $id): ?array
{
    if ($id === '' || strlen($id) > 40) {
        return null;
    }
    $stmt = $pdo->prepare(
        'SELECT t.id, t.created_by_user_id, t.name, t.doc_json, t.visibility, t.locked, t.created_at, t.updated_at,
                u.email AS creator_email,
                u.display_name AS creator_display_name
         FROM requirements_editor_templates t
         INNER JOIN users u ON u.id = t.created_by_user_id
         WHERE t.id = :id
         LIMIT 1'
    );
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return is_array($row) ? $row : null;
}

/**
 * @return array<int, array<string, mixed>>
 */
function listRequirementsTemplatesVisible(PDO $pdo, int $viewerUserId): array
{
    $stmt = $pdo->prepare(
        'SELECT t.id, t.created_by_user_id, t.name, t.doc_json, t.visibility, t.locked, t.created_at, t.updated_at,
                u.email AS creator_email,
                u.display_name AS creator_display_name
         FROM requirements_editor_templates t
         INNER JOIN users u ON u.id = t.created_by_user_id
         WHERE t.visibility = \'public\' OR t.created_by_user_id = :uid
         ORDER BY t.updated_at DESC'
    );
    $stmt->execute([':uid' => $viewerUserId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (!is_array($rows)) {
        return [];
    }
    $out = [];
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $raw = $row['doc_json'] ?? '';
        $doc = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($doc)) {
            $doc = [];
        }
        $dnRaw = $row['creator_display_name'] ?? null;
        $dn = is_string($dnRaw) ? trim($dnRaw) : '';
        $out[] = [
            'id' => (string)($row['id'] ?? ''),
            'name' => (string)($row['name'] ?? ''),
            'doc' => $doc,
            'visibility' => (string)($row['visibility'] ?? 'private'),
            'locked' => (int)($row['locked'] ?? 0) === 1,
            'created_by_user_id' => (int)($row['created_by_user_id'] ?? 0),
            'created_at' => (string)($row['created_at'] ?? ''),
            'updated_at' => (string)($row['updated_at'] ?? ''),
            'creator_email' => (string)($row['creator_email'] ?? ''),
            'creator_display_name' => $dn !== '' ? $dn : null,
        ];
    }
    return $out;
}

/**
 * @param array<string, mixed> $row DB 行（fetchRequirementsTemplateById）
 * @return array<string, mixed>
 */
function normalizeTemplateResponse(array $row): array
{
    $raw = $row['doc_json'] ?? '';
    $doc = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($doc)) {
        $doc = [];
    }
    $dnRaw = $row['creator_display_name'] ?? null;
    $dn = is_string($dnRaw) ? trim($dnRaw) : '';
    return [
        'id' => (string)($row['id'] ?? ''),
        'name' => (string)($row['name'] ?? ''),
        'doc' => $doc,
        'visibility' => (string)($row['visibility'] ?? 'private'),
        'locked' => (int)($row['locked'] ?? 0) === 1,
        'created_by_user_id' => (int)($row['created_by_user_id'] ?? 0),
        'created_at' => (string)($row['created_at'] ?? ''),
        'updated_at' => (string)($row['updated_at'] ?? ''),
        'creator_email' => (string)($row['creator_email'] ?? ''),
        'creator_display_name' => $dn !== '' ? $dn : null,
    ];
}

if ($method === 'GET') {
    $list = listRequirementsTemplatesVisible($pdo, $sessionUserId);
    echo json_encode(['success' => true, 'templates' => $list], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
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
    if ($name === '' || strlen($name) > 200) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'name は 1〜200 文字で指定してください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $vis = isset($payload['visibility']) && is_string($payload['visibility']) ? $payload['visibility'] : 'private';
    if ($vis !== 'private' && $vis !== 'public') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'visibility は private または public です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if (!array_key_exists('doc', $payload) || !is_array($payload['doc'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'doc は JSON オブジェクトにしてください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $encoded = json_encode($payload['doc'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'doc を JSON にできません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if (strlen($encoded) > REQ_TEMPLATES_DOC_MAX_BYTES) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'doc が大きすぎます。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $id = requirementsEditorTemplateNewId();
    try {
        $ins = $pdo->prepare(
            'INSERT INTO requirements_editor_templates
             (id, created_by_user_id, name, doc_json, visibility, locked)
             VALUES (:id, :uid, :name, :doc, :vis, 0)'
        );
        $ins->execute([
            ':id' => $id,
            ':uid' => $sessionUserId,
            ':name' => $name,
            ':doc' => $encoded,
            ':vis' => $vis,
        ]);
    } catch (Throwable $e) {
        if ($e instanceof PDOException && (int)$e->errorInfo[1] === 1062) {
            $dup = $pdo->prepare(
                'SELECT id FROM requirements_editor_templates
                 WHERE created_by_user_id = :uid AND name = :name LIMIT 1'
            );
            $dup->execute([':uid' => $sessionUserId, ':name' => $name]);
            $did = $dup->fetchColumn();
            http_response_code(409);
            echo json_encode([
                'success' => false,
                'code' => 'duplicate_name',
                'message' => '同じ名前のテンプレートが既にあります。',
                'existing_id' => is_string($did) ? $did : (is_scalar($did) ? (string)$did : ''),
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
        error_log('[platform-common/requirements_editor_templates POST] ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'テンプレートの保存に失敗しました。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $row = fetchRequirementsTemplateById($pdo, $id);
    if ($row === null) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => '保存後の取得に失敗しました。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo json_encode(['success' => true, 'template' => normalizeTemplateResponse($row)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
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

    $row = fetchRequirementsTemplateById($pdo, $id);
    if ($row === null) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'テンプレートが見つかりません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $creatorId = (int)($row['created_by_user_id'] ?? 0);
    if ($creatorId !== $sessionUserId) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'このテンプレートを編集する権限がありません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // 作成者のみ PATCH 可。ロック中も作成者は更新・解除可。

    $sets = [];
    $params = [':id' => $id];

    if (array_key_exists('name', $payload)) {
        if (!is_string($payload['name'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'name が不正です。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $newName = trim($payload['name']);
        if ($newName === '' || strlen($newName) > 200) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'name は 1〜200 文字で指定してください。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $sets[] = 'name = :name';
        $params[':name'] = $newName;
    }
    if (array_key_exists('doc', $payload)) {
        if (!is_array($payload['doc'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'doc は JSON オブジェクトにしてください。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $encoded = json_encode($payload['doc'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($encoded === false) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'doc を JSON にできません。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if (strlen($encoded) > REQ_TEMPLATES_DOC_MAX_BYTES) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'doc が大きすぎます。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $sets[] = 'doc_json = :doc';
        $params[':doc'] = $encoded;
    }
    if (array_key_exists('visibility', $payload)) {
        $vis = $payload['visibility'];
        if (!is_string($vis) || ($vis !== 'private' && $vis !== 'public')) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'visibility は private または public です。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $sets[] = 'visibility = :vis';
        $params[':vis'] = $vis;
    }
    if (array_key_exists('locked', $payload)) {
        $lk = $payload['locked'];
        if (!is_bool($lk) && $lk !== 0 && $lk !== 1 && $lk !== '0' && $lk !== '1') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'locked は真偽値で指定してください。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $lockedVal = ($lk === true || $lk === 1 || $lk === '1') ? 1 : 0;
        $sets[] = 'locked = :locked';
        $params[':locked'] = $lockedVal;
    }

    if ($sets === []) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => '更新するフィールドを指定してください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $sql = 'UPDATE requirements_editor_templates SET ' . implode(', ', $sets) . ' WHERE id = :id';
    try {
        $upd = $pdo->prepare($sql);
        $upd->execute($params);
    } catch (Throwable $e) {
        if ($e instanceof PDOException && (int)$e->errorInfo[1] === 1062) {
            http_response_code(409);
            echo json_encode([
                'success' => false,
                'code' => 'duplicate_name',
                'message' => '同じ名前のテンプレートが既にあります。',
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
        error_log('[platform-common/requirements_editor_templates PATCH] ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'テンプレートの更新に失敗しました。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $row = fetchRequirementsTemplateById($pdo, $id);
    if ($row === null) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => '更新後の取得に失敗しました。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo json_encode(['success' => true, 'template' => normalizeTemplateResponse($row)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($method === 'DELETE') {
    $idRaw = $_GET['id'] ?? '';
    if (!is_string($idRaw) || trim($idRaw) === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'id クエリを指定してください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $id = trim($idRaw);

    $row = fetchRequirementsTemplateById($pdo, $id);
    if ($row === null) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'テンプレートが見つかりません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $creatorId = (int)($row['created_by_user_id'] ?? 0);
    if ($creatorId !== $sessionUserId) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'このテンプレートを削除する権限がありません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $del = $pdo->prepare('DELETE FROM requirements_editor_templates WHERE id = :id LIMIT 1');
    $del->execute([':id' => $id]);
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'GET / POST / PATCH / DELETE メソッドで実行してください。'], JSON_UNESCAPED_UNICODE);
