<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__, 2) . '/auth/permission_helper.php';

header('Content-Type: application/json; charset=UTF-8');

/**
 * @param array<string, mixed> $row
 * @return array<string, mixed>|null
 */
function map_my_project_row(array $row): ?array
{
    $id = (int)($row['id'] ?? 0);
    if ($id <= 0) {
        return null;
    }
    $slug = $row['slug'] ?? null;
    $cn = $row['client_name'] ?? null;
    $st = $row['site_type'] ?? null;
    $sto = $row['site_type_other'] ?? null;
    $cat = $row['project_category'] ?? null;
    $kick = $row['kickoff_date'] ?? null;
    $rel = $row['release_due_date'] ?? null;

    return [
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

    $pageSizeRaw = $_GET['page_size'] ?? null;
    $pageSize = 0;
    if (is_string($pageSizeRaw) && $pageSizeRaw !== '' && ctype_digit($pageSizeRaw)) {
        $pageSize = (int)$pageSizeRaw;
    } elseif (is_int($pageSizeRaw) && $pageSizeRaw > 0) {
        $pageSize = $pageSizeRaw;
    }

    $paged = $pageSize >= 1 && $pageSize <= 100;
    $page = 1;
    if ($paged) {
        $pageRaw = $_GET['page'] ?? 1;
        if (is_string($pageRaw) && $pageRaw !== '' && ctype_digit($pageRaw)) {
            $page = (int)$pageRaw;
        } elseif (is_int($pageRaw) && $pageRaw > 0) {
            $page = $pageRaw;
        }
        if ($page < 1) {
            $page = 1;
        }
    }

    $projects = [];
    try {
        $baseFrom = 'FROM project_members pm INNER JOIN projects p ON p.id = pm.project_id WHERE pm.user_id = :user_id';

        if ($paged) {
            $countStmt = $pdo->prepare('SELECT COUNT(*) AS c ' . $baseFrom);
            $countStmt->execute([':user_id' => $userId]);
            $countRow = $countStmt->fetch();
            $total = 0;
            if (is_array($countRow) && isset($countRow['c'])) {
                $total = (int)$countRow['c'];
            }
            if ($total < 0) {
                $total = 0;
            }

            $maxPage = $total > 0 ? (int)max(1, (int)ceil($total / $pageSize)) : 1;
            if ($page > $maxPage) {
                $page = $maxPage;
            }
            $offset = ($page - 1) * $pageSize;
            if ($offset < 0) {
                $offset = 0;
            }

            $stmt = $pdo->prepare(
                'SELECT p.id, p.name, p.slug,
                        p.client_name, p.site_type, p.site_type_other,
                        p.project_category, p.is_renewal, p.kickoff_date, p.release_due_date, p.is_released,
                        pm.role '
                . $baseFrom
                . ' ORDER BY p.name ASC, p.id ASC LIMIT :limit OFFSET :offset'
            );
            $stmt->bindValue(':user_id', $userId, PDO::PARAM_INT);
            $stmt->bindValue(':limit', $pageSize, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $rows = $stmt->fetchAll();
            if (is_array($rows)) {
                foreach ($rows as $row) {
                    if (!is_array($row)) {
                        continue;
                    }
                    $mapped = map_my_project_row($row);
                    if ($mapped !== null) {
                        $projects[] = $mapped;
                    }
                }
            }

            echo json_encode([
                'success' => true,
                'projects' => $projects,
                'total' => $total,
                'page' => $page,
                'page_size' => $pageSize,
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $stmt = $pdo->prepare(
            'SELECT p.id, p.name, p.slug,
                    p.client_name, p.site_type, p.site_type_other,
                    p.project_category, p.is_renewal, p.kickoff_date, p.release_due_date, p.is_released,
                    pm.role '
            . $baseFrom
            . ' ORDER BY p.name ASC, p.id ASC'
        );
        $stmt->execute([':user_id' => $userId]);
        $rows = $stmt->fetchAll();
        if (is_array($rows)) {
            foreach ($rows as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $mapped = map_my_project_row($row);
                if ($mapped !== null) {
                    $projects[] = $mapped;
                }
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
