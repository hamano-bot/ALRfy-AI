<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
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

$userId = (int)$_SESSION['user_id'];

$q = isset($_GET['q']) && is_string($_GET['q']) ? trim($_GET['q']) : '';
$tokens = array_values(array_filter(array_map('trim', preg_split('/\s+/u', $q) ?: []), static fn ($t) => $t !== ''));

try {
    $pdo = createPdoFromApplicationEnv();
} catch (Throwable $e) {
    error_log('[platform-common/get_redmine_project_suggest pdo] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'データベース接続に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    ensureUserRedmineColumns($pdo);
} catch (Throwable $e) {
    error_log('[platform-common/get_redmine_project_suggest ensure columns] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'データベースのスキーマ更新に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $stmt = $pdo->prepare('SELECT redmine_base_url, redmine_api_key FROM users WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $userId]);
    $row = $stmt->fetch();
} catch (Throwable $e) {
    error_log('[platform-common/get_redmine_project_suggest select] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'ユーザー設定の取得に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$base = is_array($row) && isset($row['redmine_base_url']) && is_string($row['redmine_base_url']) ? trim($row['redmine_base_url']) : '';
$key = is_array($row) && isset($row['redmine_api_key']) && is_string($row['redmine_api_key']) ? trim($row['redmine_api_key']) : '';

if ($base === '' || $key === '') {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'message' => 'Redmine API キーが未設定です。',
        'code' => 'redmine_not_configured',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$fetch = platformRedmineFetchAllProjects($base, $key, 2000);
if ($fetch['error'] !== null) {
    http_response_code(502);
    echo json_encode([
        'success' => false,
        'message' => $fetch['error'],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$out = [];
foreach ($fetch['projects'] as $p) {
    if (!platformRedmineProjectMatchesTokens($p, $tokens)) {
        continue;
    }
    $id = isset($p['id']) ? (int)$p['id'] : 0;
    if ($id <= 0) {
        continue;
    }
    $name = isset($p['name']) && is_string($p['name']) ? $p['name'] : '';
    $ident = isset($p['identifier']) && is_string($p['identifier']) ? $p['identifier'] : '';
    $out[] = [
        'id' => $id,
        'name' => $name,
        'identifier' => $ident,
        'redmine_base_url' => rtrim($base, '/'),
    ];
    if (count($out) >= 80) {
        break;
    }
}

echo json_encode([
    'success' => true,
    'projects' => $out,
], JSON_UNESCAPED_UNICODE);
