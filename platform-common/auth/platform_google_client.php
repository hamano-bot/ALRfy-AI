<?php
declare(strict_types=1);

/**
 * platform-common 専用の Google OAuth クライアント。
 * minutes_record の getGoogleClient() は resolveGoogleRedirectUri() が常に /callback.php になるため、
 * 拡張子なしURL（/callback）に合わせるために分離している。
 */
function resolvePlatformOAuthRedirectUri(): string
{
    $host = isset($_SERVER['HTTP_HOST']) ? trim((string)$_SERVER['HTTP_HOST']) : '';
    if ($host === '') {
        throw new RuntimeException('HTTP_HOST が取得できません。');
    }
    // ホスト表記の大文字小文字差で redirect_uri_mismatch になりやすいため統一する
    $host = strtolower($host);
    $scheme = isHttpsRequest() ? 'https' : 'http';

    return $scheme . '://' . $host . '/callback';
}

function getPlatformGoogleClient(): Google\Client
{
    $client = new Google\Client();
    $client->setClientId(GOOGLE_CLIENT_ID);
    $client->setClientSecret(GOOGLE_CLIENT_SECRET);
    $client->setRedirectUri(resolvePlatformOAuthRedirectUri());
    $client->addScope('https://www.googleapis.com/auth/drive.readonly');
    $client->addScope('email');
    $client->addScope('profile');
    $client->setAccessType('offline');
    $client->setPrompt('select_account consent');

    return $client;
}
