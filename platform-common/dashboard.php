<?php
declare(strict_types=1);

require_once __DIR__ . '/auth/bootstrap.php';
require_once __DIR__ . '/portal/includes/portal_apps_service.php';

if (!isset($_SESSION['user_id'])) {
    header('Location: /login');
    exit;
}

$userId = (int)$_SESSION['user_id'];
$portal = ['success' => false, 'message' => '読み込みに失敗しました。'];
try {
    $pdo = createPdoFromApplicationEnv();
    $portal = portalFetchAppsForUser($pdo, $userId);
} catch (Throwable $e) {
    error_log('[platform-common/dashboard] ' . $e->getMessage());
}

$displayName = isset($_SESSION['user_name']) && is_string($_SESSION['user_name']) && $_SESSION['user_name'] !== ''
    ? $_SESSION['user_name']
    : ('ユーザー #' . $userId);

header('Content-Type: text/html; charset=UTF-8');
?>
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>アプリ一覧 — platform-common</title>
    <style>
        :root {
            --bg: #0f1419;
            --surface: #1a2332;
            --border: #2d3a4d;
            --text: #e7edf5;
            --muted: #8b9cb3;
            --accent: #3b82f6;
            --accent-dim: rgba(59, 130, 246, 0.15);
            --warn: #f59e0b;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            min-height: 100vh;
            font-family: system-ui, "Segoe UI", Roboto, "Hiragino Sans", "Noto Sans JP", sans-serif;
            background: var(--bg);
            color: var(--text);
            line-height: 1.5;
        }
        .wrap { max-width: 960px; margin: 0 auto; padding: 2rem 1.25rem 3rem; }
        header { margin-bottom: 2rem; }
        h1 { font-size: 1.35rem; font-weight: 600; margin: 0 0 0.35rem; }
        .sub { color: var(--muted); font-size: 0.9rem; }
        .role-pill {
            display: inline-block;
            margin-top: 0.75rem;
            padding: 0.2rem 0.65rem;
            font-size: 0.75rem;
            border-radius: 999px;
            background: var(--accent-dim);
            color: var(--accent);
        }
        .grid {
            display: grid;
            gap: 1rem;
            grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        }
        .card {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 1.15rem 1.25rem;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            min-height: 120px;
        }
        .card h2 { font-size: 1.05rem; font-weight: 600; margin: 0; }
        .card .route { font-size: 0.8rem; color: var(--muted); word-break: break-all; }
        .card.disabled { opacity: 0.65; border-style: dashed; }
        .card .badge {
            font-size: 0.7rem;
            align-self: flex-start;
            padding: 0.15rem 0.45rem;
            border-radius: 4px;
            background: rgba(245, 158, 11, 0.15);
            color: var(--warn);
        }
        .card a.cta {
            margin-top: auto;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0.5rem 0.85rem;
            font-size: 0.9rem;
            font-weight: 500;
            color: #fff;
            background: var(--accent);
            border-radius: 6px;
            text-decoration: none;
        }
        .card a.cta:hover { filter: brightness(1.08); }
        .card a.cta[aria-disabled="true"] {
            background: var(--border);
            color: var(--muted);
            pointer-events: none;
        }
        .alert {
            background: rgba(239, 68, 68, 0.12);
            border: 1px solid rgba(239, 68, 68, 0.35);
            color: #fecaca;
            padding: 1rem 1.15rem;
            border-radius: 10px;
            max-width: 32rem;
        }
        .links { margin-top: 2rem; font-size: 0.85rem; color: var(--muted); }
        .links a { color: var(--accent); }
    </style>
</head>
<body>
    <div class="wrap">
        <header>
            <h1>ようこそ、<?= htmlspecialchars($displayName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></h1>
            <p class="sub">利用するアプリを選択してください。</p>
            <?php if ($portal['success'] && isset($portal['effective_role'])): ?>
                <span class="role-pill">実効ロール（最大）: <?= htmlspecialchars((string)$portal['effective_role'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></span>
            <?php endif; ?>
        </header>

        <?php if (!$portal['success']): ?>
            <div class="alert" role="alert">
                <?= htmlspecialchars($portal['message'] ?? '利用できません。', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>
            </div>
        <?php elseif (empty($portal['apps'])): ?>
            <p class="sub">表示できるアプリがありません（<code>apps</code> テーブルを確認してください）。</p>
        <?php else: ?>
            <div class="grid">
                <?php foreach ($portal['apps'] as $app): ?>
                    <?php
                    $enabled = ($app['visibility'] ?? '') === 'visible_enabled';
                    $href = $app['route'] ?? '#';
                    ?>
                    <article class="card<?= $enabled ? '' : ' disabled' ?>">
                        <h2><?= htmlspecialchars($app['title'] ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></h2>
                        <span class="route"><?= htmlspecialchars($app['app_key'] ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?> · <?= htmlspecialchars($href, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></span>
                        <?php if (!$enabled && ($app['reason'] ?? '') === 'insufficient_role'): ?>
                            <span class="badge">権限不足（要 <?= htmlspecialchars($app['required_role'] ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>）</span>
                        <?php endif; ?>
                        <a class="cta" href="<?= htmlspecialchars($href, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>" <?= $enabled ? '' : ' aria-disabled="true"' ?>>
                            <?= $enabled ? '開く' : '利用不可' ?>
                        </a>
                    </article>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>

        <p class="links">
            API: <a href="/portal/api/me">GET /me</a> · <a href="/portal/api/apps">GET /apps</a>
        </p>
    </div>
</body>
</html>
