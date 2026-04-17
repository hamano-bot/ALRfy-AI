<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/bootstrap.php';
require_once __DIR__ . '/auth/platform_google_client.php';

$error = isset($_GET['error']) && is_string($_GET['error']) ? trim($_GET['error']) : '';

if ($error !== '') {
    header('Content-Type: text/html; charset=UTF-8');
    $message = match ($error) {
        'auth_failed' => '認証に失敗しました。もう一度お試しください。',
        'unassigned_user' => '所属先が未設定です。管理者へ権限の付与を依頼してください。',
        default => 'ログインに問題が発生しました。',
    };
    echo '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>ログイン</title></head><body>';
    echo '<p>' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</p>';
    echo '<p><a href="/login">ログインを再開</a></p>';
    echo '</body></html>';
    exit;
}

try {
    $client = getPlatformGoogleClient();
    $state = bin2hex(random_bytes(16));
    $_SESSION['oauth_state'] = $state;
    $client->setState($state);

    header('Location: ' . $client->createAuthUrl());
    exit;
} catch (Throwable $e) {
    error_log('[platform-common/login] ' . $e->getMessage());
    http_response_code(500);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode([
        'success' => false,
        'message' => 'ログイン開始処理に失敗しました。',
    ], JSON_UNESCAPED_UNICODE);
}
