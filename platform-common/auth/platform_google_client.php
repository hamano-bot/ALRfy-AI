<?php
declare(strict_types=1);

require_once __DIR__ . '/forwarded_request.php';

/**
 * platform-common 専用の Google OAuth クライアント。
 * minutes_record の getGoogleClient() は resolveGoogleRedirectUri() が常に /callback.php になるため、
 * 拡張子なしURL（/callback）に合わせるために分離している。
 */
function resolvePlatformOAuthRedirectUri(): string
{
    $host = platformResolvePublicHost();
    if ($host === '') {
        throw new RuntimeException('公開ホストが取得できません（HTTP_HOST または X-Forwarded-Host）。');
    }
    $scheme = platformResolvePublicScheme();

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
