<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__, 2) . '/auth/redmine_secret.php';
require_once dirname(__DIR__) . '/includes/user_redmine_schema.php';

header('Content-Type: application/json; charset=UTF-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' && ($_SERVER['REQUEST_METHOD'] ?? '') !== 'PUT') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'POST または PUT で実行してください。'], JSON_UNESCAPED_UNICODE);
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
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'JSON ボディが不正です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$baseUrl = null;
if (array_key_exists('redmine_base_url', $payload)) {
    if ($payload['redmine_base_url'] === null) {
        $baseUrl = null;
    } elseif (is_string($payload['redmine_base_url'])) {
        $t = trim($payload['redmine_base_url']);
        $baseUrl = $t === '' ? null : $t;
    } else {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'redmine_base_url が不正です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

$apiKey = null;
$apiKeyUnset = !array_key_exists('redmine_api_key', $payload);
if (!$apiKeyUnset) {
    if ($payload['redmine_api_key'] === null) {
        $apiKey = null;
    } elseif (is_string($payload['redmine_api_key'])) {
        $apiKey = trim($payload['redmine_api_key']);
        $apiKey = $apiKey === '' ? null : $apiKey;
    } else {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'redmine_api_key が不正です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

if ($baseUrl !== null && mb_strlen($baseUrl) > 512) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'redmine_base_url が長すぎます。'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($apiKey !== null && mb_strlen($apiKey) > 255) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'redmine_api_key が長すぎます。'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($baseUrl !== null && $baseUrl !== '') {
    $ok = filter_var($baseUrl, FILTER_VALIDATE_URL);
    if ($ok === false || !is_string($ok)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'redmine_base_url は有効な URL 形式にしてください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

try {
    $pdo = createPdoFromApplicationEnv();
} catch (Throwable $e) {
    error_log('[platform-common/patch_user_redmine pdo] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'データベース接続に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    ensureUserRedmineColumns($pdo);
} catch (Throwable $e) {
    error_log('[platform-common/patch_user_redmine ensure columns] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => '保存に失敗しました。users に redmine 列があるかマイグレーションを確認してください。',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $encryptedApiKey = null;
    if (!$apiKeyUnset && $apiKey !== null) {
        try {
            $encryptedApiKey = platformRedmineApiKeyEncrypt($apiKey);
        } catch (RuntimeException $e) {
            error_log('[platform-common/patch_user_redmine encrypt] ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => '暗号化キーが未設定のため保存できません。環境変数 REDMINE_API_KEY_ENCRYPTION_KEY(_B64) を設定してください。',
                'code' => 'redmine_key_encryption_not_configured',
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if (mb_strlen($encryptedApiKey) > 1024) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'redmine_api_key が長すぎるため暗号化後に保存できません。',
                'code' => 'redmine_api_key_too_long_for_cipher',
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    if ($apiKeyUnset) {
        $stmt = $pdo->prepare(
            'UPDATE users SET redmine_base_url = :base WHERE id = :id'
        );
        $stmt->execute([
            ':base' => $baseUrl,
            ':id' => $userId,
        ]);
    } else {
        $stmt = $pdo->prepare(
            'UPDATE users SET redmine_base_url = :base, redmine_api_key = :key WHERE id = :id'
        );
        $stmt->execute([
            ':base' => $baseUrl,
            ':key' => $apiKey === null ? null : $encryptedApiKey,
            ':id' => $userId,
        ]);
    }
} catch (Throwable $e) {
    error_log('[platform-common/patch_user_redmine] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => '保存に失敗しました。users に redmine 列があるかマイグレーションを確認してください。',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$sel = $pdo->prepare('SELECT redmine_base_url, redmine_api_key FROM users WHERE id = :id LIMIT 1');
$sel->execute([':id' => $userId]);
$row = $sel->fetch();
$b = is_array($row) && isset($row['redmine_base_url']) && is_string($row['redmine_base_url']) ? trim($row['redmine_base_url']) : '';
$storedKey = is_array($row) && isset($row['redmine_api_key']) && is_string($row['redmine_api_key']) ? $row['redmine_api_key'] : null;
$k = platformRedmineApiKeyDecrypt($storedKey);
$configured = $b !== '' && $k !== '';

echo json_encode([
    'success' => true,
    'redmine' => [
        'configured' => $configured,
        'base_url' => $configured ? $b : null,
    ],
], JSON_UNESCAPED_UNICODE);
