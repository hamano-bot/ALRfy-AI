<?php
declare(strict_types=1);

/**
 * PHP 組み込みサーバー用ルーター（拡張子なしURL）。
 * 起動例: php -S 0.0.0.0:8001 router.php
 * （カレントディレクトリを platform-common にしたうえで実行）
 */
if (PHP_SAPI !== 'cli-server') {
    return false;
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$path = $path === '' ? '/' : $path;
$path = rtrim($path, '/') ?: '/';

$routes = [
    '/login' => __DIR__ . '/login.php',
    '/callback' => __DIR__ . '/callback.php',
    '/dashboard' => __DIR__ . '/dashboard.php',
    '/minutes' => __DIR__ . '/minutes.php',
    '/portal/api/me' => __DIR__ . '/portal/api/get_me.php',
    '/portal/api/apps' => __DIR__ . '/portal/api/get_apps.php',
    '/portal/api/project-permission' => __DIR__ . '/portal/api/get_project_permission.php',
];

if (isset($routes[$path])) {
    require $routes[$path];
    return true;
}

$legacy = [
    '/login.php' => '/login',
    '/callback.php' => '/callback',
    '/dashboard.php' => '/dashboard',
    '/minutes.php' => '/minutes',
];

if (isset($legacy[$path]) && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $q = $_SERVER['QUERY_STRING'] ?? '';
    $target = $legacy[$path] . ($q !== '' ? '?' . $q : '');
    header('Location: ' . $target, true, 301);
    exit;
}

return false;
