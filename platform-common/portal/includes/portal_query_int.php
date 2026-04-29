<?php
declare(strict_types=1);

/**
 * 見積などの正の整数 ID をクエリから解決する。
 * リライトで $_GET が空でも REQUEST_URI のクエリに残っている場合があるため、
 * $_GET / QUERY_STRING / REQUEST_URI の順で参照する。
 */
function portal_positive_int_from_query(string $paramName): int
{
    $sources = [];

    if (isset($_GET[$paramName])) {
        $sources[] = $_GET[$paramName];
    }

    $qs = (string)($_SERVER['QUERY_STRING'] ?? '');
    if ($qs !== '') {
        $parsed = [];
        parse_str($qs, $parsed);
        if (isset($parsed[$paramName])) {
            $sources[] = $parsed[$paramName];
        }
    }

    $uri = (string)($_SERVER['REQUEST_URI'] ?? '');
    $qpos = strpos($uri, '?');
    if ($qpos !== false) {
        $parsedUri = [];
        parse_str(substr($uri, $qpos + 1), $parsedUri);
        if (isset($parsedUri[$paramName])) {
            $sources[] = $parsedUri[$paramName];
        }
    }

    foreach ($sources as $raw) {
        if (is_array($raw)) {
            $raw = $raw[0] ?? null;
        }
        if ($raw === null) {
            continue;
        }
        if (is_int($raw)) {
            return $raw > 0 ? $raw : 0;
        }
        $s = trim((string)$raw);
        if ($s !== '' && ctype_digit($s)) {
            $v = (int)$s;
            return $v > 0 ? $v : 0;
        }
    }

    return 0;
}
