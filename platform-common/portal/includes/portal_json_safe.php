<?php
declare(strict_types=1);

/**
 * DB 由来の文字列を含む JSON 応答用。無効 UTF-8 があると json_encode が false になり得るため SUBSTITUTE を付与する。
 */
function portal_json_encode_db(mixed $value): string|false
{
    $flags = JSON_UNESCAPED_UNICODE;
    if (defined('JSON_INVALID_UTF8_SUBSTITUTE')) {
        $flags |= JSON_INVALID_UTF8_SUBSTITUTE;
    }
    return json_encode($value, $flags);
}

function portal_json_echo_db(mixed $value): void
{
    $out = portal_json_encode_db($value);
    if ($out === false) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'JSONの生成に失敗しました。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo $out;
}
