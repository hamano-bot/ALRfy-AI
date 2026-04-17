<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__, 2) . '/auth/permission_helper.php';

header('Content-Type: application/json; charset=UTF-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'POST メソッドで実行してください。'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'ログインが必要です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$creatorUserId = (int)$_SESSION['user_id'];
if ($creatorUserId <= 0) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'ログインが必要です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw = file_get_contents('php://input');
$payload = json_decode($raw !== false ? $raw : '', true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'JSON ボディが不正です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$siteTypeAllowed = [
    'corporate' => true,
    'ec' => true,
    'member_portal' => true,
    'internal_portal' => true,
    'owned_media' => true,
    'product_portal' => true,
    'other' => true,
];

$name = isset($payload['name']) && is_string($payload['name']) ? trim($payload['name']) : '';
if ($name === '' || mb_strlen($name) > 255) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'name は必須で、255 文字以内にしてください。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$clientName = null;
if (isset($payload['client_name']) && $payload['client_name'] !== null) {
    if (!is_string($payload['client_name'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'client_name は文字列または null にしてください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $cn = trim($payload['client_name']);
    if ($cn !== '' && mb_strlen($cn) > 255) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'client_name は 255 文字以内にしてください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $clientName = $cn === '' ? null : $cn;
}

$siteType = null;
if (array_key_exists('site_type', $payload)) {
    if ($payload['site_type'] === null || $payload['site_type'] === '') {
        $siteType = null;
    } elseif (is_string($payload['site_type']) && isset($siteTypeAllowed[$payload['site_type']])) {
        $siteType = $payload['site_type'];
    } else {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'site_type が不正です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

$siteTypeOther = null;
if (isset($payload['site_type_other']) && $payload['site_type_other'] !== null) {
    if (!is_string($payload['site_type_other'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'site_type_other は文字列または null にしてください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $sto = trim($payload['site_type_other']);
    if ($sto !== '' && mb_strlen($sto) > 255) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'site_type_other は 255 文字以内にしてください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $siteTypeOther = $sto === '' ? null : $sto;
}

if ($siteType === 'other' && ($siteTypeOther === null || $siteTypeOther === '')) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'site_type が other のときは site_type_other を入力してください。'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($siteType !== 'other' && $siteTypeOther !== null && $siteTypeOther !== '') {
    $siteTypeOther = null;
}

$isRenewal = false;
if (isset($payload['is_renewal'])) {
    if (is_bool($payload['is_renewal'])) {
        $isRenewal = $payload['is_renewal'];
    } elseif (is_int($payload['is_renewal'])) {
        $isRenewal = $payload['is_renewal'] === 1;
    } elseif (is_string($payload['is_renewal'])) {
        $isRenewal = $payload['is_renewal'] === '1' || strtolower($payload['is_renewal']) === 'true';
    } else {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'is_renewal が不正です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

$renewalUrls = [];
if (isset($payload['renewal_urls'])) {
    if (!is_array($payload['renewal_urls'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'renewal_urls は配列にしてください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    foreach ($payload['renewal_urls'] as $idx => $u) {
        if (!is_string($u)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'renewal_urls の各要素は文字列の URL にしてください。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $u = trim($u);
        if ($u === '') {
            continue;
        }
        if (mb_strlen($u) > 2048) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'renewal_urls の URL が長すぎます。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $renewalUrls[] = ['url' => $u, 'sort_order' => (int)$idx];
    }
}

if ($isRenewal === false) {
    $renewalUrls = [];
}

/**
 * @return string|false|null
 */
function parseOptionalDate(mixed $v): string|false|null
{
    if ($v === null || $v === '') {
        return null;
    }
    if (!is_string($v)) {
        return false;
    }
    $v = trim($v);
    if ($v === '') {
        return null;
    }
    $d = DateTimeImmutable::createFromFormat('Y-m-d', $v);
    if ($d === false || $d->format('Y-m-d') !== $v) {
        return false;
    }
    return $v;
}

$kickoffDate = parseOptionalDate($payload['kickoff_date'] ?? null);
if ($kickoffDate === false) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'kickoff_date は YYYY-MM-DD 形式または null にしてください。'], JSON_UNESCAPED_UNICODE);
    exit;
}
$releaseDueDate = parseOptionalDate($payload['release_due_date'] ?? null);
if ($releaseDueDate === false) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'release_due_date は YYYY-MM-DD 形式または null にしてください。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$redmineRows = [];
if (isset($payload['redmine_links'])) {
    if (!is_array($payload['redmine_links'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'redmine_links は配列にしてください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $seen = [];
    foreach ($payload['redmine_links'] as $idx => $item) {
        $rid = null;
        $baseUrl = null;
        if (is_int($item) || (is_string($item) && ctype_digit($item))) {
            $rid = (int)$item;
        } elseif (is_array($item)) {
            if (isset($item['redmine_project_id'])) {
                $rid = is_int($item['redmine_project_id']) ? $item['redmine_project_id'] : (int)$item['redmine_project_id'];
            } elseif (isset($item['id'])) {
                $rid = is_int($item['id']) ? $item['id'] : (int)$item['id'];
            }
            if (isset($item['redmine_base_url']) && $item['redmine_base_url'] !== null) {
                if (!is_string($item['redmine_base_url'])) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'redmine_base_url は文字列または null にしてください。'], JSON_UNESCAPED_UNICODE);
                    exit;
                }
                $bu = trim($item['redmine_base_url']);
                if ($bu !== '') {
                    if (mb_strlen($bu) > 512) {
                        http_response_code(400);
                        echo json_encode(['success' => false, 'message' => 'redmine_base_url が長すぎます。'], JSON_UNESCAPED_UNICODE);
                        exit;
                    }
                    $baseUrl = $bu;
                }
            }
        } else {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'redmine_links の要素が不正です。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($rid === null || $rid <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'redmine_project_id は正の整数にしてください。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $key = (string)$rid;
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $redmineRows[] = [
            'redmine_project_id' => $rid,
            'redmine_base_url' => $baseUrl,
            'sort_order' => (int)$idx,
        ];
    }
}

$miscLinks = [];
if (isset($payload['misc_links'])) {
    if (!is_array($payload['misc_links'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'misc_links は配列にしてください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    foreach ($payload['misc_links'] as $idx => $row) {
        if (!is_array($row)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'misc_links の各要素はオブジェクトにしてください。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $label = isset($row['label']) && is_string($row['label']) ? trim($row['label']) : '';
        $url = isset($row['url']) && is_string($row['url']) ? trim($row['url']) : '';
        if ($label === '' || $url === '') {
            continue;
        }
        if (mb_strlen($label) > 255) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'misc_links の label が長すぎます。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if (mb_strlen($url) > 2048) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'misc_links の url が長すぎます。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $miscLinks[] = [
            'label' => $label,
            'url' => $url,
            'sort_order' => (int)$idx,
        ];
    }
}

$participantMap = [];
if (isset($payload['participants'])) {
    if (!is_array($payload['participants'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'participants は配列にしてください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    foreach ($payload['participants'] as $row) {
        if (!is_array($row)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'participants の各要素はオブジェクトにしてください。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $uid = $row['user_id'] ?? null;
        if (!is_int($uid) && !(is_string($uid) && ctype_digit($uid))) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'participants.user_id が不正です。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $uid = (int)$uid;
        if ($uid <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'participants.user_id は正の整数にしてください。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $role = $row['role'] ?? '';
        if ($role !== 'editor' && $role !== 'viewer') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'participants.role は editor または viewer にしてください。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if (!isset($participantMap[$uid]) || rolePriority($role) > rolePriority($participantMap[$uid])) {
            $participantMap[$uid] = $role;
        }
    }
}

/**
 * 表示名から slug を生成し、既存と重複しない値を返す。
 */
function allocateUniqueProjectSlug(PDO $pdo, string $name): string
{
    $ascii = strtolower((string)preg_replace('/[^a-zA-Z0-9]+/', '-', $name));
    $ascii = trim($ascii, '-');
    if ($ascii === '') {
        $ascii = 'project';
    }
    if (strlen($ascii) > 48) {
        $ascii = substr($ascii, 0, 48);
        $ascii = rtrim($ascii, '-');
    }
    $base = $ascii;
    for ($n = 0; $n < 1000; $n++) {
        $candidate = $n === 0 ? $base : $base . '-' . $n;
        if (strlen($candidate) > 64) {
            $candidate = substr($base, 0, max(1, 64 - strlen('-' . $n))) . '-' . $n;
        }
        $stmt = $pdo->prepare('SELECT 1 FROM projects WHERE slug = :slug LIMIT 1');
        $stmt->execute([':slug' => $candidate]);
        if ($stmt->fetch() === false) {
            return $candidate;
        }
    }
    throw new RuntimeException('slug の一意割り当てに失敗しました。');
}

function userIdExists(PDO $pdo, int $userId): bool
{
    $stmt = $pdo->prepare('SELECT 1 FROM users WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $userId]);
    return $stmt->fetch() !== false;
}

try {
    $pdo = createPdoFromApplicationEnv();
} catch (Throwable $e) {
    error_log('[platform-common/post_projects pdo] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'データベース接続に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!userIdExists($pdo, $creatorUserId)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'ユーザーが見つかりません。'], JSON_UNESCAPED_UNICODE);
    exit;
}

foreach (array_keys($participantMap) as $pid) {
    if (!userIdExists($pdo, $pid)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => '存在しない user_id が participants に含まれています。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

try {
    $slug = allocateUniqueProjectSlug($pdo, $name);
} catch (Throwable $e) {
    error_log('[platform-common/post_projects slug] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'プロジェクトの登録に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$isRenewalInt = $isRenewal ? 1 : 0;

try {
    $pdo->beginTransaction();

    $insertProject = $pdo->prepare(
        'INSERT INTO projects (
            name, slug, client_name, site_type, site_type_other,
            is_renewal, kickoff_date, release_due_date
        ) VALUES (
            :name, :slug, :client_name, :site_type, :site_type_other,
            :is_renewal, :kickoff_date, :release_due_date
        )'
    );
    $insertProject->execute([
        ':name' => $name,
        ':slug' => $slug,
        ':client_name' => $clientName,
        ':site_type' => $siteType,
        ':site_type_other' => $siteTypeOther,
        ':is_renewal' => $isRenewalInt,
        ':kickoff_date' => $kickoffDate,
        ':release_due_date' => $releaseDueDate,
    ]);
    $projectId = (int)$pdo->lastInsertId();
    if ($projectId <= 0) {
        throw new RuntimeException('lastInsertId が取得できませんでした。');
    }

    if ($renewalUrls !== []) {
        $insUrl = $pdo->prepare(
            'INSERT INTO project_renewal_urls (project_id, url, sort_order) VALUES (:pid, :url, :sort_order)'
        );
        foreach ($renewalUrls as $ru) {
            $insUrl->execute([
                ':pid' => $projectId,
                ':url' => $ru['url'],
                ':sort_order' => $ru['sort_order'],
            ]);
        }
    }

    if ($redmineRows !== []) {
        $insRm = $pdo->prepare(
            'INSERT INTO project_redmine_links (project_id, redmine_project_id, redmine_base_url, sort_order)
             VALUES (:pid, :rid, :base, :sort_order)'
        );
        foreach ($redmineRows as $rr) {
            $insRm->execute([
                ':pid' => $projectId,
                ':rid' => $rr['redmine_project_id'],
                ':base' => $rr['redmine_base_url'],
                ':sort_order' => $rr['sort_order'],
            ]);
        }
    }

    if ($miscLinks !== []) {
        $insMisc = $pdo->prepare(
            'INSERT INTO project_misc_links (project_id, label, url, sort_order)
             VALUES (:pid, :label, :url, :sort_order)'
        );
        foreach ($miscLinks as $ml) {
            $insMisc->execute([
                ':pid' => $projectId,
                ':label' => $ml['label'],
                ':url' => $ml['url'],
                ':sort_order' => $ml['sort_order'],
            ]);
        }
    }

    $insMember = $pdo->prepare(
        'INSERT INTO project_members (project_id, user_id, role) VALUES (:pid, :uid, :role)'
    );
    $insMember->execute([
        ':pid' => $projectId,
        ':uid' => $creatorUserId,
        ':role' => 'owner',
    ]);

    foreach ($participantMap as $uid => $role) {
        if ($uid === $creatorUserId) {
            continue;
        }
        $insMember->execute([
            ':pid' => $projectId,
            ':uid' => $uid,
            ':role' => $role,
        ]);
    }

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[platform-common/post_projects] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'プロジェクトの登録に失敗しました。スキーマ（マイグレーション）を確認してください。',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(201);
echo json_encode([
    'success' => true,
    'project' => [
        'id' => $projectId,
        'name' => $name,
        'slug' => $slug,
        'client_name' => $clientName,
        'site_type' => $siteType,
        'site_type_other' => $siteTypeOther,
        'is_renewal' => $isRenewal,
        'kickoff_date' => $kickoffDate,
        'release_due_date' => $releaseDueDate,
    ],
], JSON_UNESCAPED_UNICODE);
