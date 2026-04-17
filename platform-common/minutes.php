<?php
declare(strict_types=1);

/**
 * 議事録アプリへのゲートウェイ（拡張子なし /minutes）。
 * 環境ごとの会議一覧 URL へリダイレクトする。
 *
 * 設定: MINUTES_RECORD_MEETINGS_URL（例: http://minutes-record.com:8080/meetings）
 */
require_once __DIR__ . '/auth/bootstrap.php';

$url = getenv('MINUTES_RECORD_MEETINGS_URL');
$url = is_string($url) ? trim($url) : '';
if ($url === '' || !preg_match('#^https?://#i', $url)) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=UTF-8');
    echo 'MINUTES_RECORD_MEETINGS_URL が未設定、または無効です。.env.platform-common を確認してください。';
    exit;
}

header('Location: ' . $url, true, 302);
exit;
