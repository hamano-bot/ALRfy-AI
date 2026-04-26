<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__) . '/includes/estimate_schema.php';

header('Content-Type: application/json; charset=UTF-8');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

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
    error_log('[project_team_permissions schema] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '初期化に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'GET') {
    $projectId = isset($_GET['project_id']) && is_string($_GET['project_id']) && ctype_digit($_GET['project_id']) ? (int)$_GET['project_id'] : 0;
    if ($projectId <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'project_id を指定してください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $stmt = $pdo->prepare('SELECT team_tag, role, granted_by, granted_at FROM project_team_permissions WHERE project_id = :id ORDER BY id ASC');
    $stmt->execute([':id' => $projectId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(['success' => true, 'permissions' => is_array($rows) ? $rows : []], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'PATCH') {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw !== false ? $raw : '', true);
    if (!is_array($payload) || !isset($payload['project_id']) || !is_numeric($payload['project_id']) || !isset($payload['permissions']) || !is_array($payload['permissions'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'project_id と permissions は必須です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $projectId = (int)$payload['project_id'];
    $permissions = $payload['permissions'];
    try {
        $pdo->beginTransaction();
        $pdo->prepare('DELETE FROM project_team_permissions WHERE project_id = :id')->execute([':id' => $projectId]);
        $ins = $pdo->prepare(
            'INSERT INTO project_team_permissions (project_id, team_tag, role, granted_by) VALUES (:project_id, :team_tag, :role, :granted_by)'
        );
        foreach ($permissions as $perm) {
            if (!is_array($perm)) {
                continue;
            }
            $teamTag = isset($perm['team_tag']) && is_string($perm['team_tag']) ? trim($perm['team_tag']) : '';
            $role = isset($perm['role']) && is_string($perm['role']) ? $perm['role'] : 'viewer';
            if ($teamTag === '' || !in_array($role, ['owner', 'editor', 'viewer'], true)) {
                continue;
            }
            $ins->execute([
                ':project_id' => $projectId,
                ':team_tag' => strtolower($teamTag),
                ':role' => $role,
                ':granted_by' => $sessionUserId,
            ]);
        }
        $logStmt = $pdo->prepare(
            'INSERT INTO estimate_operation_logs (estimate_id, operation_type, operator_user_id, detail_json)
             VALUES (NULL, :operation_type, :operator_user_id, :detail_json)'
        );
        $logStmt->execute([
            ':operation_type' => 'project_team_permissions_updated',
            ':operator_user_id' => $sessionUserId,
            ':detail_json' => json_encode(
                ['project_id' => $projectId, 'permission_count' => count($permissions)],
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
            ),
        ]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[project_team_permissions patch] ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => '更新に失敗しました。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'GET / PATCH で実行してください。'], JSON_UNESCAPED_UNICODE);
