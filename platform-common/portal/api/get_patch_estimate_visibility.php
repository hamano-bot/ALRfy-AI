<?php
declare(strict_types=1);

// JSON API のため、warning/notice をレスポンスに混ぜない
if (ob_get_level() === 0) {
    ob_start();
}
ini_set('display_errors', '0');
set_error_handler(static function ($severity, $message, $file = '', $line = 0): bool {
    error_log(sprintf('[estimate_visibility php warning] %s in %s:%d', (string)$message, (string)$file, (int)$line));
    return true;
});
register_shutdown_function(static function (): void {
    $err = error_get_last();
    if (!is_array($err)) {
        return;
    }
    error_log(
        sprintf(
            '[estimate_visibility shutdown] type=%d message=%s file=%s line=%d',
            (int)($err['type'] ?? 0),
            (string)($err['message'] ?? ''),
            (string)($err['file'] ?? ''),
            (int)($err['line'] ?? 0)
        )
    );
    $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR];
    if (!in_array((int)($err['type'] ?? 0), $fatalTypes, true)) {
        return;
    }
    if (ob_get_length() !== false && ob_get_length() > 0) {
        ob_clean();
    }
    http_response_code(500);
    echo json_encode(
        ['success' => false, 'message' => '公開範囲APIで内部エラーが発生しました。'],
        JSON_UNESCAPED_UNICODE
    );
});

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

function estimateVisibilityIsAdminUser(PDO $pdo, int $userId): bool
{
    if ($userId <= 0) {
        return false;
    }
    $stmt = $pdo->prepare('SELECT is_admin FROM users WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $userId]);
    return ((int)$stmt->fetchColumn()) === 1;
}

function estimateVisibilityTeamTags(PDO $pdo, int $userId): array
{
    $out = [];
    if ($userId <= 0) {
        return $out;
    }
    $stmt = $pdo->prepare('SELECT team FROM users WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!is_array($row) || !is_string($row['team'] ?? null) || trim($row['team']) === '') {
        return $out;
    }
    $decoded = json_decode((string)$row['team'], true);
    if (!is_array($decoded)) {
        return $out;
    }
    foreach ($decoded as $tag) {
        if (is_string($tag) && trim($tag) !== '') {
            $out[strtolower(trim($tag))] = true;
        }
    }
    return $out;
}

function estimateVisibilityResolveRole(PDO $pdo, int $estimateId, int $userId, bool $isAdmin, array $teamTags, string $scope, int $createdBy): string
{
    $rank = 0;
    if ($createdBy === $userId) {
        $rank = 3;
    } elseif ($isAdmin) {
        $rank = 2;
    } elseif ($scope === 'public_all_users') {
        $rank = 1;
    }
    $uStmt = $pdo->prepare('SELECT role FROM estimate_user_permissions WHERE estimate_id = :estimate_id AND user_id = :user_id LIMIT 1');
    $uStmt->execute([':estimate_id' => $estimateId, ':user_id' => $userId]);
    $u = $uStmt->fetch(PDO::FETCH_ASSOC);
    if (is_array($u) && is_string($u['role'] ?? null)) {
        $r = $u['role'];
        if ($r === 'editor') {
            $rank = max($rank, 2);
        } elseif ($r === 'viewer') {
            $rank = max($rank, 1);
        }
    }
    if (!empty($teamTags)) {
        $tStmt = $pdo->prepare('SELECT role FROM estimate_team_permissions WHERE estimate_id = :estimate_id AND team_tag = :team_tag');
        foreach (array_keys($teamTags) as $tag) {
            $tStmt->execute([':estimate_id' => $estimateId, ':team_tag' => $tag]);
            $rows = $tStmt->fetchAll(PDO::FETCH_ASSOC);
            if (!is_array($rows)) {
                continue;
            }
            foreach ($rows as $row) {
                if (!is_array($row) || !is_string($row['role'] ?? null)) {
                    continue;
                }
                $r = $row['role'];
                if ($r === 'editor') {
                    $rank = max($rank, 2);
                } elseif ($r === 'viewer') {
                    $rank = max($rank, 1);
                }
            }
        }
    }
    return $rank >= 3 ? 'owner' : ($rank >= 2 ? 'editor' : ($rank >= 1 ? 'viewer' : 'none'));
}

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
    $ownerStmt = $pdo->prepare('SELECT created_by_user_id FROM project_estimates WHERE id = :id LIMIT 1');
    $ownerStmt->execute([':id' => $estimateId]);
    $ownerRow = $ownerStmt->fetch(PDO::FETCH_ASSOC);
    $effectiveRole = estimateVisibilityResolveRole(
        $pdo,
        $estimateId,
        $sessionUserId,
        estimateVisibilityIsAdminUser($pdo, $sessionUserId),
        estimateVisibilityTeamTags($pdo, $sessionUserId),
        (string)($row['visibility_scope'] ?? 'public_all_users'),
        is_array($ownerRow) ? (int)($ownerRow['created_by_user_id'] ?? 0) : 0
    );
    if ($effectiveRole === 'none') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'アクセス権限がありません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $teamStmt = $pdo->prepare('SELECT team_tag, role FROM estimate_team_permissions WHERE estimate_id = :id ORDER BY id ASC');
    $teamStmt->execute([':id' => $estimateId]);
    $userStmt = $pdo->prepare('SELECT user_id, role FROM estimate_user_permissions WHERE estimate_id = :id ORDER BY id ASC');
    $userStmt->execute([':id' => $estimateId]);
    echo json_encode([
        'success' => true,
        'effective_role' => $effectiveRole,
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
    $metaStmt = $pdo->prepare('SELECT created_by_user_id, visibility_scope FROM project_estimates WHERE id = :id LIMIT 1');
    $metaStmt->execute([':id' => $estimateId]);
    $metaRow = $metaStmt->fetch(PDO::FETCH_ASSOC);
    if (!is_array($metaRow)) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => '見積が見つかりません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $effectiveRole = estimateVisibilityResolveRole(
        $pdo,
        $estimateId,
        $sessionUserId,
        estimateVisibilityIsAdminUser($pdo, $sessionUserId),
        estimateVisibilityTeamTags($pdo, $sessionUserId),
        (string)($metaRow['visibility_scope'] ?? 'public_all_users'),
        (int)($metaRow['created_by_user_id'] ?? 0)
    );
    if (!in_array($effectiveRole, ['owner', 'editor'], true)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => '権限設定を変更する権限がありません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $normalizedTeams = [];
    foreach ($teamPermissions as $perm) {
        if (!is_array($perm)) {
            continue;
        }
        $teamTag = isset($perm['team_tag']) && is_string($perm['team_tag']) ? strtolower(trim($perm['team_tag'])) : '';
        $role = isset($perm['role']) && is_string($perm['role']) ? $perm['role'] : 'viewer';
        if ($teamTag === '' || !in_array($role, ['editor', 'viewer'], true)) {
            continue;
        }
        $normalizedTeams[] = ['team_tag' => $teamTag, 'role' => $role];
    }
    $normalizedUsers = [];
    foreach ($userPermissions as $perm) {
        if (!is_array($perm)) {
            continue;
        }
        $userId = (isset($perm['user_id']) && is_numeric($perm['user_id'])) ? (int)$perm['user_id'] : 0;
        $role = isset($perm['role']) && is_string($perm['role']) ? $perm['role'] : 'viewer';
        if ($userId <= 0 || !in_array($role, ['editor', 'viewer'], true)) {
            continue;
        }
        $normalizedUsers[] = ['user_id' => $userId, 'role' => $role];
    }
    if ($scope === 'restricted' && count($normalizedTeams) === 0 && count($normalizedUsers) === 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => '個別制限ではチームまたは個人のいずれかを設定してください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    try {
        $pdo->beginTransaction();
        $upd = $pdo->prepare('UPDATE project_estimates SET visibility_scope = :scope, updated_by_user_id = :uid WHERE id = :id');
        $upd->execute([':scope' => $scope, ':uid' => $sessionUserId, ':id' => $estimateId]);

        $pdo->prepare('DELETE FROM estimate_team_permissions WHERE estimate_id = :id')->execute([':id' => $estimateId]);
        $pdo->prepare('DELETE FROM estimate_user_permissions WHERE estimate_id = :id')->execute([':id' => $estimateId]);
        if ($scope === 'restricted') {
            $insTeam = $pdo->prepare('INSERT INTO estimate_team_permissions (estimate_id, team_tag, role, granted_by) VALUES (:estimate_id, :team_tag, :role, :granted_by)');
            foreach ($normalizedTeams as $perm) {
                $teamTag = $perm['team_tag'];
                $role = $perm['role'];
                $insTeam->execute([':estimate_id' => $estimateId, ':team_tag' => $teamTag, ':role' => $role, ':granted_by' => $sessionUserId]);
            }
            $insUser = $pdo->prepare('INSERT INTO estimate_user_permissions (estimate_id, user_id, role, granted_by) VALUES (:estimate_id, :user_id, :role, :granted_by)');
            foreach ($normalizedUsers as $perm) {
                $userId = $perm['user_id'];
                $role = $perm['role'];
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
                    'team_permission_count' => count($normalizedTeams),
                    'user_permission_count' => count($normalizedUsers),
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
