<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__, 2) . '/auth/permission_helper.php';

header('Content-Type: application/json; charset=UTF-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'GET メソッドで実行してください。'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'ログインが必要です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = createPdoFromApplicationEnv();
    $userId = (int)$_SESSION['user_id'];

    if (!hasAnyMembership($pdo, $userId)) {
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'message' => '所属先が未設定のため利用できません。',
            'code' => 'unassigned_user',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $projects = [];
    try {
        $stmt = $pdo->prepare(
            'SELECT p.id, p.name, p.slug,
                    p.client_name, p.site_type, p.site_type_other,
                    p.project_category, p.is_renewal, p.kickoff_date, p.release_due_date, p.is_released,
                    pm.role
             FROM project_members pm
             INNER JOIN projects p ON p.id = pm.project_id
             WHERE pm.user_id = :user_id
             ORDER BY p.name ASC, p.id ASC'
        );
        $stmt->execute([':user_id' => $userId]);
        $rows = $stmt->fetchAll();
        if (is_array($rows)) {
            foreach ($rows as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $id = (int)($row['id'] ?? 0);
                if ($id <= 0) {
                    continue;
                }
                $slug = $row['slug'] ?? null;
                $cn = $row['client_name'] ?? null;
                $st = $row['site_type'] ?? null;
                $sto = $row['site_type_other'] ?? null;
                $cat = $row['project_category'] ?? null;
                $kick = $row['kickoff_date'] ?? null;
                $rel = $row['release_due_date'] ?? null;
                $projects[] = [
                    'id' => $id,
                    'name' => (string)($row['name'] ?? ''),
                    'slug' => is_string($slug) && $slug !== '' ? $slug : null,
                    'role' => isset($row['role']) && is_string($row['role']) ? $row['role'] : 'viewer',
                    'client_name' => is_string($cn) && $cn !== '' ? $cn : null,
                    'site_type' => is_string($st) && $st !== '' ? $st : null,
                    'site_type_other' => is_string($sto) && $sto !== '' ? $sto : null,
                    'project_category' => is_string($cat) && $cat !== '' ? $cat : ((int)($row['is_renewal'] ?? 0) === 1 ? 'renewal' : 'new'),
                    'is_renewal' => (int)($row['is_renewal'] ?? 0) === 1,
                    'kickoff_date' => is_string($kick) && $kick !== '' ? $kick : null,
                    'release_due_date' => is_string($rel) && $rel !== '' ? $rel : null,
                    'is_released' => (int)($row['is_released'] ?? 0) === 1,
                ];
            }
        }
    } catch (Throwable $e) {
        error_log('[platform-common/get_my_projects query] ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Project一覧の取得に失敗しました。',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode([
        'success' => true,
        'projects' => $projects,
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    error_log('[platform-common/get_my_projects] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Project一覧の取得に失敗しました。',
    ], JSON_UNESCAPED_UNICODE);
}
