<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__, 2) . '/auth/permission_helper.php';

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

$projectIdRaw = $_GET['project_id'] ?? null;
if (!is_scalar($projectIdRaw)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'project_id を指定してください。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$projectId = (int)$projectIdRaw;
if ($projectId <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'project_id は正の整数で指定してください。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$resourceTypeRaw = $_GET['resource_type'] ?? null;
$resourceIdRaw = $_GET['resource_id'] ?? null;

$resourceType = null;
$resourceId = null;

if (is_string($resourceTypeRaw) && $resourceTypeRaw !== '') {
    $resourceType = trim($resourceTypeRaw);
}
if (is_scalar($resourceIdRaw) && (string)$resourceIdRaw !== '') {
    $resourceId = (int)$resourceIdRaw;
    if ($resourceId <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'resource_id は正の整数で指定してください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

if (($resourceType !== null && $resourceId === null) || ($resourceType === null && $resourceId !== null)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'resource_type と resource_id はセットで指定してください。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = createPdoFromApplicationEnv();
    $userId = (int)$_SESSION['user_id'];

    if (!hasAnyMembership($pdo, $userId)) {
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'message' => '所属先が未設定のため利用できません。',
            'code' => 'unassigned_user',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $permission = resolveEffectiveRole($pdo, $userId, $projectId, $resourceType, $resourceId);
    $effectiveRole = isset($permission['effective_role']) && is_string($permission['effective_role'])
        ? $permission['effective_role']
        : 'no_access';

    if ($effectiveRole === 'no_access') {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'message' => 'このプロジェクトへのアクセス権限がありません。',
            'project_id' => $projectId,
            'effective_role' => $effectiveRole,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode([
        'success' => true,
        'project_id' => $projectId,
        'effective_role' => $effectiveRole,
        'source' => (string)($permission['source'] ?? 'none'),
        'candidates' => [
            'resource_role' => $permission['candidates']['resource_role'] ?? null,
            'project_role' => $permission['candidates']['project_role'] ?? null,
        ],
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    error_log('[platform-common/get_project_permission] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => '権限情報の取得に失敗しました。',
    ], JSON_UNESCAPED_UNICODE);
}
