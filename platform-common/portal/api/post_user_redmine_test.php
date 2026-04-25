<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__, 2) . '/auth/redmine_secret.php';
require_once dirname(__DIR__) . '/includes/redmine_http.php';
require_once dirname(__DIR__) . '/includes/user_redmine_schema.php';

header('Content-Type: application/json; charset=UTF-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'POST で実行してください。'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'ログインが必要です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$userId = (int)$_SESSION['user_id'];
$raw = file_get_contents('php://input');
$payload = json_decode($raw !== false ? $raw : '', true);
if (!is_array($payload)) {
    $payload = [];
}

$baseUrl = null;
$key = null;

if (isset($payload['redmine_base_url']) && is_string($payload['redmine_base_url'])) {
    $baseUrl = trim($payload['redmine_base_url']);
    $baseUrl = $baseUrl === '' ? null : $baseUrl;
}
if (isset($payload['redmine_api_key']) && is_string($payload['redmine_api_key'])) {
    $key = trim($payload['redmine_api_key']);
    $key = $key === '' ? null : $key;
}

try {
    $pdo = createPdoFromApplicationEnv();
} catch (Throwable $e) {
    error_log('[platform-common/post_user_redmine_test pdo] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'データベース接続に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    ensureUserRedmineColumns($pdo);
} catch (Throwable $e) {
    error_log('[platform-common/post_user_redmine_test ensure columns] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'データベースのスキーマ更新に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($baseUrl === null || $key === null) {
    $stmt = $pdo->prepare('SELECT redmine_base_url, redmine_api_key FROM users WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $userId]);
    $row = $stmt->fetch();
    if (is_array($row)) {
        if ($baseUrl === null && isset($row['redmine_base_url']) && is_string($row['redmine_base_url'])) {
            $t = trim($row['redmine_base_url']);
            $baseUrl = $t === '' ? null : $t;
        }
        if ($key === null && isset($row['redmine_api_key']) && is_string($row['redmine_api_key'])) {
            $key = platformRedmineApiKeyDecrypt($row['redmine_api_key']);
        }
    }
}

if ($baseUrl === null || $baseUrl === '' || $key === null || $key === '') {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Redmine の URL と API キーを入力するか、先に保存してください。',
        'code' => 'redmine_not_configured',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$res = platformRedmineGetJson($baseUrl, $key, '/projects.json?limit=1');
if ($res['ok']) {
    echo json_encode([
        'success' => true,
        'message' => '接続に成功しました。',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(502);
echo json_encode([
    'success' => false,
    'message' => 'Redmine への接続に失敗しました（HTTP ' . $res['http_code'] . '）。URL・API キー・ネットワークを確認してください。',
    'http_code' => $res['http_code'],
], JSON_UNESCAPED_UNICODE);
