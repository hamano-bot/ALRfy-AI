<?php
declare(strict_types=1);

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
if ($sessionUserId <= 0) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'ログインが必要です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = createPdoFromApplicationEnv();
    ensureEstimateSchema($pdo);
} catch (Throwable $e) {
    error_log('[project_estimates schema] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '初期化に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'GET') {
    $projectId = isset($_GET['project_id']) && is_string($_GET['project_id']) && ctype_digit($_GET['project_id']) ? (int)$_GET['project_id'] : 0;
    if ($projectId <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'project_id を指定してください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $stmt = $pdo->prepare(
        'SELECT id, estimate_number, title, estimate_status, issue_date, total_including_tax, visibility_scope, created_by_user_id
         FROM project_estimates
         WHERE project_id = :project_id
         ORDER BY updated_at DESC, id DESC'
    );
    $stmt->execute([':project_id' => $projectId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $estimates = [];
    if (is_array($rows)) {
        $adminStmt = $pdo->prepare('SELECT is_admin FROM users WHERE id = :id LIMIT 1');
        $adminStmt->execute([':id' => $sessionUserId]);
        $isAdmin = ((int)$adminStmt->fetchColumn()) === 1;
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $estimateId = (int)($row['id'] ?? 0);
            if ($estimateId <= 0) {
                continue;
            }
            $visibility = (string)($row['visibility_scope'] ?? 'public_all_users');
            $createdBy = (int)($row['created_by_user_id'] ?? 0);
            $roleRank = 0;
            if ($createdBy === $sessionUserId) {
                $roleRank = 3;
            } elseif ($isAdmin) {
                $roleRank = 2;
            } elseif ($visibility === 'public_all_users') {
                $roleRank = 1;
            }
            $effectiveRole = $roleRank >= 3 ? 'owner' : ($roleRank >= 2 ? 'editor' : ($roleRank >= 1 ? 'viewer' : 'none'));
            if ($effectiveRole === 'none') {
                continue;
            }
            $row['effective_role'] = $effectiveRole;
            $estimates[] = $row;
        }
    }
    echo json_encode(['success' => true, 'estimates' => $estimates], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'PATCH') {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw !== false ? $raw : '', true);
    if (!is_array($payload) || !isset($payload['project_id']) || !is_numeric($payload['project_id']) || !isset($payload['estimate_ids']) || !is_array($payload['estimate_ids'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'project_id と estimate_ids は必須です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $projectId = (int)$payload['project_id'];
    $estimateIds = [];
    foreach ($payload['estimate_ids'] as $id) {
        if (is_int($id) || (is_string($id) && ctype_digit($id))) {
            $estimateIds[(int)$id] = true;
        }
    }
    $estimateIds = array_keys($estimateIds);
    try {
        $pdo->beginTransaction();
        $pdo->prepare('UPDATE project_estimates SET project_id = NULL WHERE project_id = :project_id')->execute([':project_id' => $projectId]);
        if ($estimateIds !== []) {
            $upd = $pdo->prepare('UPDATE project_estimates SET project_id = :project_id WHERE id = :id');
            foreach ($estimateIds as $estimateId) {
                $upd->execute([':project_id' => $projectId, ':id' => $estimateId]);
            }
        }
        $logStmt = $pdo->prepare(
            'INSERT INTO estimate_operation_logs (estimate_id, operation_type, operator_user_id, detail_json)
             VALUES (NULL, :operation_type, :operator_user_id, :detail_json)'
        );
        $logStmt->execute([
            ':operation_type' => 'project_estimates_updated',
            ':operator_user_id' => (int)$_SESSION['user_id'],
            ':detail_json' => json_encode(
                ['project_id' => $projectId, 'estimate_ids' => $estimateIds, 'count' => count($estimateIds)],
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
            ),
        ]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[project_estimates patch] ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => '更新に失敗しました。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'GET / PATCH で実行してください。'], JSON_UNESCAPED_UNICODE);
