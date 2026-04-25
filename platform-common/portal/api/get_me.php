<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__, 2) . '/auth/permission_helper.php';
require_once dirname(__DIR__, 2) . '/auth/redmine_secret.php';

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

$allowUnassigned = isset($_GET['unassigned_ok']) && $_GET['unassigned_ok'] === '1';

try {
    $pdo = createPdoFromApplicationEnv();
    $userId = (int)$_SESSION['user_id'];

    if (!$allowUnassigned && !hasAnyMembership($pdo, $userId)) {
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'message' => '所属先が未設定のため利用できません。',
            'code' => 'unassigned_user',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $user = null;
    try {
        $userStmt = $pdo->prepare(
            'SELECT u.id, u.email, u.theme, u.redmine_base_url, u.redmine_api_key
             FROM users u
             WHERE u.id = :user_id
             LIMIT 1'
        );
        $userStmt->execute([':user_id' => $userId]);
        $user = $userStmt->fetch();
    } catch (Throwable $e) {
        $userStmt = $pdo->prepare(
            'SELECT u.id, u.email, u.theme
             FROM users u
             WHERE u.id = :user_id
             LIMIT 1'
        );
        $userStmt->execute([':user_id' => $userId]);
        $user = $userStmt->fetch();
    }

    if ($user === false) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'ユーザー情報が見つかりません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $rb = is_array($user) && isset($user['redmine_base_url']) && is_string($user['redmine_base_url']) ? trim($user['redmine_base_url']) : '';
    $storedKey = is_array($user) && isset($user['redmine_api_key']) && is_string($user['redmine_api_key']) ? $user['redmine_api_key'] : null;
    $rk = platformRedmineApiKeyDecrypt($storedKey);
    $redmineConfigured = $rb !== '' && $rk !== '';
    $redminePublic = [
        'configured' => $redmineConfigured,
        'base_url' => $redmineConfigured ? $rb : null,
    ];

    $globalRole = 'no_access';
    $projectRoles = [];

    try {
        $roleStmt = $pdo->prepare('SELECT project_id, role FROM project_members WHERE user_id = :user_id');
        $roleStmt->execute([':user_id' => $userId]);
        $roles = $roleStmt->fetchAll();
        if (is_array($roles)) {
            foreach ($roles as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $role = isset($row['role']) && is_string($row['role']) ? $row['role'] : 'no_access';
                if (rolePriority($role) > rolePriority($globalRole)) {
                    $globalRole = $role;
                }
                $projectRoles[] = [
                    'project_id' => (int)($row['project_id'] ?? 0),
                    'role' => $role,
                ];
            }
        }
    } catch (Throwable $e) {
        // 初期段階で project_members が未作成でも応答を返せるようにする。
    }

    $availableApps = [];
    try {
        $effectiveRole = $globalRole;
        $appsStmt = $pdo->query(
            'SELECT a.app_key, a.is_active, ap.required_role
             FROM apps a
             LEFT JOIN app_access_policies ap ON ap.app_id = a.id AND ap.is_enabled = 1
             ORDER BY a.display_order ASC, a.id ASC'
        );
        $appRows = $appsStmt->fetchAll();
        if (is_array($appRows)) {
            foreach ($appRows as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $requiredRole = isset($row['required_role']) && is_string($row['required_role']) && $row['required_role'] !== ''
                    ? $row['required_role']
                    : 'viewer';
                $isActive = (int)($row['is_active'] ?? 0) === 1;
                $visibility = resolveAppVisibility($effectiveRole, $requiredRole, $isActive, 'show_disabled');
                if ($visibility === 'hidden') {
                    continue;
                }
                $availableApps[] = [
                    'app_key' => (string)($row['app_key'] ?? ''),
                    'visibility' => $visibility,
                ];
            }
        }
    } catch (Throwable $e) {
        // apps 未作成の初期段階でも /me は返却できるようにする。
    }

    $displayName = isset($_SESSION['user_name']) && is_string($_SESSION['user_name']) && $_SESSION['user_name'] !== ''
        ? (string)$_SESSION['user_name']
        : (string)$user['email'];

    echo json_encode([
        'success' => true,
        'user' => [
            'id' => (int)$user['id'],
            'email' => (string)$user['email'],
            'display_name' => $displayName,
            'theme' => (string)($user['theme'] ?? 'default'),
        ],
        'roles_summary' => [
            'global' => $globalRole,
            'projects' => $projectRoles,
        ],
        'available_apps' => $availableApps,
        'redmine' => $redminePublic,
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    error_log('[platform-common/get_me] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'ユーザー情報の取得に失敗しました。'], JSON_UNESCAPED_UNICODE);
}
