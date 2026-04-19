<?php
declare(strict_types=1);

/**
 * PHP 組み込みサーバー用ルーター（拡張子なしURL）。
 * 起動例: php -S 127.0.0.1:8000 router.php
 * Next とポートを分ける場合は dev-router.ps1 / dev-router.sh（既定 127.0.0.1:8000）を推奨。
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
    '/portal/api/my-projects' => __DIR__ . '/portal/api/get_my_projects.php',
    '/portal/api/projects' => __DIR__ . '/portal/api/post_projects.php',
    '/portal/api/project' => __DIR__ . '/portal/api/get_patch_project.php',
    '/portal/api/project-hearing-sheet' => __DIR__ . '/portal/api/get_patch_project_hearing_sheet.php',
    '/portal/api/hearing-insight-batch-state' => __DIR__ . '/portal/api/get_hearing_insight_batch_state.php',
    '/portal/api/hearing-insight-export' => __DIR__ . '/portal/api/get_hearing_insight_export.php',
    '/portal/api/hearing-template-definition' => __DIR__ . '/portal/api/get_hearing_template_definition.php',
    '/portal/api/patch-hearing-template-definition' => __DIR__ . '/portal/api/patch_hearing_template_definition.php',
    '/portal/api/system-update-events' => __DIR__ . '/portal/api/get_system_update_events.php',
    '/portal/api/user/redmine' => __DIR__ . '/portal/api/patch_user_redmine.php',
    '/portal/api/user/redmine/test' => __DIR__ . '/portal/api/post_user_redmine_test.php',
    '/portal/api/redmine-project-suggest' => __DIR__ . '/portal/api/get_redmine_project_suggest.php',
    '/portal/api/project-redmine-issues' => __DIR__ . '/portal/api/get_project_redmine_issues.php',
    '/portal/api/project-redmine-issue-create' => __DIR__ . '/portal/api/post_project_redmine_issue_create.php',
    '/portal/api/user-suggest' => __DIR__ . '/portal/api/get_user_suggest.php',
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

// /project-list（旧 /project-manager）は Next.js（project-manager/apps/web）が別プロセスで待ち受ける。PHP だけ起動していると 404 になるため案内する。
if ($path === '/project-list' || str_starts_with($path, '/project-list/')
    || $path === '/project-manager' || str_starts_with($path, '/project-manager/')) {
    http_response_code(503);
    header('Content-Type: text/html; charset=UTF-8');
    echo '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>案件管理 — Next.js が必要</title></head><body style="font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;">';
    echo '<h1>この URL は Next.js が応答します</h1>';
    echo '<p>いま <strong>platform-common（PHP）</strong> がポート 8001 で動いています。Next 起動時は <code>/</code> がダッシュボード、<code>/project-list</code> が<strong>案件管理</strong>です。</p>';
    echo '<h2>動かし方</h2><ol>';
    echo '<li><code>project-manager/apps/web</code> で <code>npm run dev:lan</code> を実行（ポート 8001 で Next を起動）。</li>';
    echo '<li>そのとき <strong>同じポートで php -S は止める</strong>（どちらか一方のみ）。</li>';
    echo '<li>PHP のダッシュボードも必要なら、PHP を別ポート（例: 8002）で起動し、ブラウザでポートを分ける。</li>';
    echo '</ol>';
    echo '<p><a href="/dashboard">platform-common ダッシュボード</a>（PHP が 8001 のとき）</p>';
    echo '</body></html>';
    exit;
}

return false;
