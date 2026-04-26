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
    error_log('[estimate_visibility schema] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '初期化に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'GET') {
    $estimateId = isset($_GET['estimate_id']) && is_string($_GET['estimate_id']) && ctype_digit($_GET['estimate_id']) ? (int)$_GET['estimate_id'] : 0;
    if ($estimateId <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'estimate_id を指定してください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $stmt = $pdo->prepare('SELECT visibility_scope FROM project_estimates WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $estimateId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!is_array($row)) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => '見積が見つかりません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $teamStmt = $pdo->prepare('SELECT team_tag, role FROM estimate_team_permissions WHERE estimate_id = :id ORDER BY id ASC');
    $teamStmt->execute([':id' => $estimateId]);
    $userStmt = $pdo->prepare('SELECT user_id, role FROM estimate_user_permissions WHERE estimate_id = :id ORDER BY id ASC');
    $userStmt->execute([':id' => $estimateId]);
    echo json_encode([
        'success' => true,
        'visibility_scope' => $row['visibility_scope'] ?? 'public_all_users',
        'team_permissions' => $teamStmt->fetchAll(PDO::FETCH_ASSOC) ?: [],
        'user_permissions' => $userStmt->fetchAll(PDO::FETCH_ASSOC) ?: [],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'PATCH') {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw !== false ? $raw : '', true);
    if (!is_array($payload) || !isset($payload['estimate_id']) || !is_numeric($payload['estimate_id'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'estimate_id は必須です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $estimateId = (int)$payload['estimate_id'];
    $scope = (isset($payload['visibility_scope']) && $payload['visibility_scope'] === 'restricted') ? 'restricted' : 'public_all_users';
    $teamPermissions = (isset($payload['team_permissions']) && is_array($payload['team_permissions'])) ? $payload['team_permissions'] : [];
    $userPermissions = (isset($payload['user_permissions']) && is_array($payload['user_permissions'])) ? $payload['user_permissions'] : [];

    try {
        $pdo->beginTransaction();
        $upd = $pdo->prepare('UPDATE project_estimates SET visibility_scope = :scope, updated_by_user_id = :uid WHERE id = :id');
        $upd->execute([':scope' => $scope, ':uid' => $sessionUserId, ':id' => $estimateId]);

        $pdo->prepare('DELETE FROM estimate_team_permissions WHERE estimate_id = :id')->execute([':id' => $estimateId]);
        $pdo->prepare('DELETE FROM estimate_user_permissions WHERE estimate_id = :id')->execute([':id' => $estimateId]);
        if ($scope === 'restricted') {
            $insTeam = $pdo->prepare('INSERT INTO estimate_team_permissions (estimate_id, team_tag, role, granted_by) VALUES (:estimate_id, :team_tag, :role, :granted_by)');
            foreach ($teamPermissions as $perm) {
                if (!is_array($perm)) {
                    continue;
                }
                $teamTag = isset($perm['team_tag']) && is_string($perm['team_tag']) ? strtolower(trim($perm['team_tag'])) : '';
                $role = isset($perm['role']) && is_string($perm['role']) ? $perm['role'] : 'viewer';
                if ($teamTag === '' || !in_array($role, ['owner', 'editor', 'viewer'], true)) {
                    continue;
                }
                $insTeam->execute([':estimate_id' => $estimateId, ':team_tag' => $teamTag, ':role' => $role, ':granted_by' => $sessionUserId]);
            }
            $insUser = $pdo->prepare('INSERT INTO estimate_user_permissions (estimate_id, user_id, role, granted_by) VALUES (:estimate_id, :user_id, :role, :granted_by)');
            foreach ($userPermissions as $perm) {
                if (!is_array($perm)) {
                    continue;
                }
                $userId = (isset($perm['user_id']) && is_numeric($perm['user_id'])) ? (int)$perm['user_id'] : 0;
                $role = isset($perm['role']) && is_string($perm['role']) ? $perm['role'] : 'viewer';
                if ($userId <= 0 || !in_array($role, ['owner', 'editor', 'viewer'], true)) {
                    continue;
                }
                $insUser->execute([':estimate_id' => $estimateId, ':user_id' => $userId, ':role' => $role, ':granted_by' => $sessionUserId]);
            }
        }
        $logStmt = $pdo->prepare(
            'INSERT INTO estimate_operation_logs (estimate_id, operation_type, operator_user_id, detail_json)
             VALUES (:estimate_id, :operation_type, :operator_user_id, :detail_json)'
        );
        $logStmt->execute([
            ':estimate_id' => $estimateId,
            ':operation_type' => 'estimate_visibility_updated',
            ':operator_user_id' => $sessionUserId,
            ':detail_json' => json_encode(
                [
                    'visibility_scope' => $scope,
                    'team_permission_count' => count($teamPermissions),
                    'user_permission_count' => count($userPermissions),
                ],
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
            ),
        ]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[estimate_visibility patch] ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => '更新に失敗しました。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'GET / PATCH で実行してください。'], JSON_UNESCAPED_UNICODE);
