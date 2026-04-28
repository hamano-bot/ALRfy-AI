<?php
declare(strict_types=1);

// JSON API のため、warning/notice をレスポンスに混ぜない
if (ob_get_level() === 0) {
    ob_start();
}
ini_set('display_errors', '0');
set_error_handler(static function ($severity, $message, $file = '', $line = 0): bool {
    error_log(sprintf('[estimate_project_links php warning] %s in %s:%d', (string)$message, (string)$file, (int)$line));
    return true;
});
register_shutdown_function(static function (): void {
    $err = error_get_last();
    if (!is_array($err)) {
        return;
    }
    error_log(
        sprintf(
            '[estimate_project_links shutdown] type=%d message=%s file=%s line=%d',
            (int)($err['type'] ?? 0),
            (string)($err['message'] ?? ''),
            (string)($err['file'] ?? ''),
            (int)($err['line'] ?? 0)
        )
    );
    $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR];
    if (!in_array((int)($err['type'] ?? 0), $fatalTypes, true)) {
        return;
    }
    if (ob_get_length() !== false && ob_get_length() > 0) {
        ob_clean();
    }
    http_response_code(500);
    echo json_encode(
        ['success' => false, 'message' => 'Project紐づけAPIで内部エラーが発生しました。'],
        JSON_UNESCAPED_UNICODE
    );
});

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__) . '/includes/estimate_schema.php';

header('Content-Type: application/json; charset=UTF-8');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'ログインが必要です。'], JSON_UNESCAPED_UNICODE);
    exit;
}
$sessionUserId = (int)$_SESSION['user_id'];

function estimateProjectLinksIsAdmin(PDO $pdo, int $userId): bool
{
    if ($userId <= 0) {
        return false;
    }
    $stmt = $pdo->prepare('SELECT is_admin FROM users WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $userId]);
    return ((int)$stmt->fetchColumn()) === 1;
}

function estimateProjectLinksTeamTags(PDO $pdo, int $userId): array
{
    $out = [];
    $stmt = $pdo->prepare('SELECT team FROM users WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!is_array($row) || !is_string($row['team'] ?? null) || trim($row['team']) === '') {
        return $out;
    }
    $decoded = json_decode((string)$row['team'], true);
    if (!is_array($decoded)) {
        return $out;
    }
    foreach ($decoded as $tag) {
        if (is_string($tag) && trim($tag) !== '') {
            $out[strtolower(trim($tag))] = true;
        }
    }
    return $out;
}

function estimateProjectLinksRole(PDO $pdo, int $estimateId, int $sessionUserId): string
{
    $metaStmt = $pdo->prepare('SELECT visibility_scope, created_by_user_id FROM project_estimates WHERE id = :id LIMIT 1');
    $metaStmt->execute([':id' => $estimateId]);
    $meta = $metaStmt->fetch(PDO::FETCH_ASSOC);
    if (!is_array($meta)) {
        return 'none';
    }
    $rank = 0;
    $isAdmin = estimateProjectLinksIsAdmin($pdo, $sessionUserId);
    if ((int)($meta['created_by_user_id'] ?? 0) === $sessionUserId) {
        $rank = 3;
    } elseif ($isAdmin) {
        $rank = 2;
    } elseif ((string)($meta['visibility_scope'] ?? 'public_all_users') === 'public_all_users') {
        $rank = 1;
    }
    $uStmt = $pdo->prepare('SELECT role FROM estimate_user_permissions WHERE estimate_id = :estimate_id AND user_id = :user_id LIMIT 1');
    $uStmt->execute([':estimate_id' => $estimateId, ':user_id' => $sessionUserId]);
    $u = $uStmt->fetch(PDO::FETCH_ASSOC);
    if (is_array($u) && is_string($u['role'] ?? null)) {
        if ($u['role'] === 'editor') {
            $rank = max($rank, 2);
        } elseif ($u['role'] === 'viewer') {
            $rank = max($rank, 1);
        }
    }
    $tags = estimateProjectLinksTeamTags($pdo, $sessionUserId);
    if (!empty($tags)) {
        $tStmt = $pdo->prepare('SELECT role FROM estimate_team_permissions WHERE estimate_id = :estimate_id AND team_tag = :team_tag');
        foreach (array_keys($tags) as $tag) {
            $tStmt->execute([':estimate_id' => $estimateId, ':team_tag' => $tag]);
            $rows = $tStmt->fetchAll(PDO::FETCH_ASSOC);
            if (!is_array($rows)) {
                continue;
            }
            foreach ($rows as $row) {
                if (!is_array($row) || !is_string($row['role'] ?? null)) {
                    continue;
                }
                if ($row['role'] === 'editor') {
                    $rank = max($rank, 2);
                } elseif ($row['role'] === 'viewer') {
                    $rank = max($rank, 1);
                }
            }
        }
    }
    return $rank >= 3 ? 'owner' : ($rank >= 2 ? 'editor' : ($rank >= 1 ? 'viewer' : 'none'));
}

try {
    $pdo = createPdoFromApplicationEnv();
    ensureEstimateSchema($pdo);
} catch (Throwable $e) {
    error_log('[estimate_project_links schema] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '初期化に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'GET') {
    $estimateId = isset($_GET['estimate_id']) && is_string($_GET['estimate_id']) && ctype_digit($_GET['estimate_id']) ? (int)$_GET['estimate_id'] : 0;
    if ($estimateId <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'estimate_id を指定してください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if (estimateProjectLinksRole($pdo, $estimateId, $sessionUserId) === 'none') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'アクセス権限がありません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $stmt = $pdo->prepare(
        'SELECT epl.project_id, epl.link_type, p.name AS project_name
         FROM estimate_project_links epl
         INNER JOIN projects p ON p.id = epl.project_id
         WHERE epl.estimate_id = :estimate_id
         ORDER BY epl.id ASC'
    );
    $stmt->execute([':estimate_id' => $estimateId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(['success' => true, 'links' => is_array($rows) ? $rows : []], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'PATCH') {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw !== false ? $raw : '', true);
    if (!is_array($payload) || !isset($payload['estimate_id']) || !is_numeric($payload['estimate_id']) || !isset($payload['links']) || !is_array($payload['links'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'estimate_id と links は必須です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $estimateId = (int)$payload['estimate_id'];
    $effectiveRole = estimateProjectLinksRole($pdo, $estimateId, $sessionUserId);
    if (!in_array($effectiveRole, ['owner', 'editor'], true)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Project紐づけを更新する権限がありません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $links = $payload['links'];
    try {
        $pdo->beginTransaction();
        $pdo->prepare('DELETE FROM estimate_project_links WHERE estimate_id = :estimate_id')->execute([':estimate_id' => $estimateId]);
        $ins = $pdo->prepare('INSERT INTO estimate_project_links (estimate_id, project_id, link_type) VALUES (:estimate_id, :project_id, :link_type)');
        foreach ($links as $link) {
            if (!is_array($link)) {
                continue;
            }
            $projectId = (isset($link['project_id']) && is_numeric($link['project_id'])) ? (int)$link['project_id'] : 0;
            $linkType = (isset($link['link_type']) && $link['link_type'] === 'primary') ? 'primary' : 'related';
            if ($projectId <= 0) {
                continue;
            }
            $ins->execute([':estimate_id' => $estimateId, ':project_id' => $projectId, ':link_type' => $linkType]);
        }
        $logStmt = $pdo->prepare(
            'INSERT INTO estimate_operation_logs (estimate_id, operation_type, operator_user_id, detail_json)
             VALUES (:estimate_id, :operation_type, :operator_user_id, :detail_json)'
        );
        $logStmt->execute([
            ':estimate_id' => $estimateId,
            ':operation_type' => 'estimate_project_links_updated',
            ':operator_user_id' => $sessionUserId,
            ':detail_json' => json_encode(['link_count' => count($links)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[estimate_project_links patch] ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => '更新に失敗しました。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'GET / PATCH で実行してください。'], JSON_UNESCAPED_UNICODE);
