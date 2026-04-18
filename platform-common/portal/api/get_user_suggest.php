<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';

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

$q = isset($_GET['q']) && is_string($_GET['q']) ? trim($_GET['q']) : '';
if ($q === '') {
    echo json_encode(['success' => true, 'users' => []], JSON_UNESCAPED_UNICODE);
    exit;
}

if (mb_strlen($q) > 200) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => '検索語が長すぎます。'], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * LIKE 用に % _ \ をエスケープする。
 */
function escapeMysqlLike(string $s): string
{
    return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $s);
}

try {
    $pdo = createPdoFromApplicationEnv();
} catch (Throwable $e) {
    error_log('[platform-common/get_user_suggest pdo] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'データベース接続に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$seen = [];
$users = [];

$push = static function (array $row) use (&$seen, &$users): void {
    $id = (int)$row['id'];
    if ($id <= 0 || isset($seen[$id])) {
        return;
    }
    $seen[$id] = true;
    $users[] = [
        'id' => $id,
        'email' => (string)$row['email'],
    ];
};

if (ctype_digit($q)) {
    $id = (int)$q;
    if ($id > 0) {
        $stmt = $pdo->prepare('SELECT id, email FROM users WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        if (is_array($row)) {
            $push($row);
        }
    }
}

if (mb_strlen($q) >= 2) {
    $like = '%' . escapeMysqlLike($q) . '%';
    $stmt = $pdo->prepare(
        'SELECT id, email FROM users WHERE email LIKE :like ORDER BY id ASC LIMIT 16'
    );
    $stmt->execute([':like' => $like]);
    $rows = $stmt->fetchAll();
    if (is_array($rows)) {
        foreach ($rows as $row) {
            if (is_array($row)) {
                $push($row);
            }
        }
    }
}

echo json_encode(['success' => true, 'users' => $users], JSON_UNESCAPED_UNICODE);
