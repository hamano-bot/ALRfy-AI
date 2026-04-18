<?php
declare(strict_types=1);

require_once __DIR__ . '/forwarded_request.php';

/**
 * platform-common 用の共通ブートストラップ。
 * 既存の minutes_record 系 config.php を優先的に再利用しつつ、
 * 将来的に ALRfy-AI_dev/includes/config.php へ移行できるようにします。
 */

/**
 * `minutes_record_dev/.env` の DB_DSN が Docker 用（host=db）のとき、
 * ホスト上の `php -S` からは名前解決できない。`platform-common/.env.platform-common` があれば
 * 共有 config 読み込み後に上書きする。
 */
function platformCommonApplyLocalEnvOverrides(): void
{
    $override = dirname(__DIR__) . '/.env.platform-common';
    if (!is_file($override)) {
        return;
    }

    $lines = file($override, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return;
    }

    foreach ($lines as $line) {
        $trimmed = trim($line);
        if ($trimmed === '' || str_starts_with($trimmed, '#')) {
            continue;
        }
        $parts = explode('=', $trimmed, 2);
        if (count($parts) !== 2) {
            continue;
        }
        $key = trim($parts[0]);
        $value = trim($parts[1]);
        $value = trim($value, "\"'");
        if ($key === '') {
            continue;
        }
        putenv($key . '=' . $value);
        $_ENV[$key] = $value;
        $_SERVER[$key] = $value;
    }
}

function requirePlatformConfig(): void
{
    // platform-common の検証時は shared config 側の canonical host 強制を無効化する。
    // （minutes_record_dev の .env で minutes-record.com へリダイレクトされるのを防ぐ）
    putenv('APP_ENFORCE_CANONICAL_HOST=0');
    $_ENV['APP_ENFORCE_CANONICAL_HOST'] = '0';
    $_SERVER['APP_ENFORCE_CANONICAL_HOST'] = '0';

    // platform-common 側の公開オリジンと OAuth リダイレクト先を現在ホスト基準へ固定する。
    // minutes_record_dev の config.php は resolveGoogleRedirectUri() で APP_PUBLIC_BASE_URL を最優先するため、
    // ここを上書きしないと .env の minutes-record.com へ戻ってしまう。
    // Next.js 等のプロキシ経由では X-Forwarded-Host を優先する。
    $httpHost = platformResolvePublicHost();
    if ($httpHost !== '') {
        $scheme = platformResolvePublicScheme();
        $publicBase = $scheme . '://' . $httpHost;
        putenv('APP_PUBLIC_BASE_URL=' . $publicBase);
        $_ENV['APP_PUBLIC_BASE_URL'] = $publicBase;
        $_SERVER['APP_PUBLIC_BASE_URL'] = $publicBase;

        $redirectUri = $publicBase . '/callback';
        putenv('GOOGLE_REDIRECT_URI=' . $redirectUri);
        $_ENV['GOOGLE_REDIRECT_URI'] = $redirectUri;
        $_SERVER['GOOGLE_REDIRECT_URI'] = $redirectUri;
    }

    $candidates = [
        dirname(__DIR__, 2) . '/includes/config.php',
        dirname(__DIR__, 3) . '/minutes_record_dev/includes/config.php',
        dirname(__DIR__, 3) . '/minutes_record/includes/config.php',
    ];

    foreach ($candidates as $path) {
        if (is_file($path)) {
            require_once $path;
            platformCommonApplyLocalEnvOverrides();
            return;
        }
    }

    throw new RuntimeException('config.php が見つかりません。includes/config.php の配置を確認してください。');
}

requirePlatformConfig();
