<?php
declare(strict_types=1);

/**
 * Next.js などのリバースプロキシ経由でアクセスするとき、ブラウザのホストを X-Forwarded-* で受け取る。
 * （例: ブラウザは http://dev-alrfy-ai.com:8001/login、PHP は http://127.0.0.1:8000 で待ち受け）
 */
function platformResolvePublicHost(): string
{
    $forwarded = isset($_SERVER['HTTP_X_FORWARDED_HOST']) ? trim((string) $_SERVER['HTTP_X_FORWARDED_HOST']) : '';
    if ($forwarded !== '') {
        $forwarded = strtolower(trim(explode(',', $forwarded)[0]));

        return $forwarded;
    }
    $host = isset($_SERVER['HTTP_HOST']) ? trim((string) $_SERVER['HTTP_HOST']) : '';

    return $host === '' ? '' : strtolower($host);
}

function platformResolvePublicScheme(): string
{
    $proto = isset($_SERVER['HTTP_X_FORWARDED_PROTO']) ? trim((string) $_SERVER['HTTP_X_FORWARDED_PROTO']) : '';
    if ($proto !== '') {
        $proto = strtolower(trim(explode(',', $proto)[0]));

        return $proto === 'https' ? 'https' : 'http';
    }
    $https = isset($_SERVER['HTTPS']) && is_string($_SERVER['HTTPS']) && strtolower($_SERVER['HTTPS']) !== 'off';

    return $https ? 'https' : 'http';
}
