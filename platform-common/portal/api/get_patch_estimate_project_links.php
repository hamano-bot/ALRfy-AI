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
            ':operator_user_id' => (int)$_SESSION['user_id'],
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
