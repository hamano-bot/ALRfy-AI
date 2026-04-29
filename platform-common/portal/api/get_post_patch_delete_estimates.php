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
    error_log('[estimates schema] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'スキーマの初期化に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

function estimateNormalizeStatus(mixed $v): string
{
    if (!is_string($v)) {
        return 'draft';
    }
    $x = trim($v);
    return in_array($x, ['draft', 'submitted', 'won', 'lost'], true) ? $x : 'draft';
}

/** 単位が percent のときは数量をパーセント値（例: 15 = 15%）とみなし (数量/100)×単価×係数。 */
function estimateComputeLineAmount(string $unitType, float $quantity, float $unitPrice, float $factor): float
{
    if ($unitType === 'percent') {
        return round(($quantity / 100.0) * $unitPrice * $factor, 2);
    }

    return round($quantity * $unitPrice * $factor, 2);
}

function estimateResolveTaxRate(PDO $pdo, string $issueDate): array
{
    $stmt = $pdo->prepare(
        'SELECT tax_rate_percent, effective_from
         FROM tax_rate_master
         WHERE is_active = 1 AND effective_from <= :d
         ORDER BY effective_from DESC
         LIMIT 1'
    );
    $stmt->execute([':d' => $issueDate]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!is_array($row)) {
        return ['percent' => 10.0, 'effective_from' => null];
    }
    return [
        'percent' => (float)($row['tax_rate_percent'] ?? 10.0),
        'effective_from' => is_string($row['effective_from'] ?? null) ? $row['effective_from'] : null,
    ];
}

/**
 * 見積番号末尾の 4 桁連番を取り出す（旧: 見積_{日付}_{略称}_{seq} / 新: 見積_{略称}_{seq}）。
 */
function estimateParseTailSequence4(string $estimateNumber): ?int
{
    if (preg_match('/^見積_(\d{8})_(.+)_(\d{4})$/u', $estimateNumber, $m) === 1) {
        return (int) $m[3];
    }
    if (preg_match('/^見積_(.+)_(\d{4})$/u', $estimateNumber, $m) === 1) {
        return (int) $m[2];
    }

    return null;
}

/** 同一クライアント略称（DB の client_abbr。空は NULL／空文字を同一バケット）内で最大連番を求める */
function estimateMaxSequenceForClientBucket(PDO $pdo, string $clientAbbrTrim): int
{
    if ($clientAbbrTrim === '') {
        $stmt = $pdo->query(
            "SELECT estimate_number FROM project_estimates WHERE client_abbr IS NULL OR TRIM(COALESCE(client_abbr, '')) = ''"
        );
    } else {
        $stmt = $pdo->prepare('SELECT estimate_number FROM project_estimates WHERE client_abbr = :cab');
        $stmt->execute([':cab' => $clientAbbrTrim]);
    }
    $max = 0;
    if ($stmt instanceof PDOStatement) {
        while (true) {
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row === false) {
                break;
            }
            $seq = estimateParseTailSequence4((string)($row['estimate_number'] ?? ''));
            if ($seq !== null) {
                $max = max($max, $seq);
            }
        }
    }

    return $max;
}

/**
 * 新規見積番号。クライアント略称ごとに 0001 から連番（DB 上の client_abbr バケットで集計）。
 * 格納形式: 見積_{略称またはCLIENT}_{####}（日付は含めず、帳票・ファイル名は issue_date と略称で表現する）。
 */
function estimateGenerateNumber(PDO $pdo, string $clientAbbr): string
{
    $clientAbbr = trim($clientAbbr);
    $abbrKey = $clientAbbr === '' ? 'CLIENT' : $clientAbbr;
    $max = estimateMaxSequenceForClientBucket($pdo, $clientAbbr);
    $seq = $max + 1;
    if ($seq > 9999) {
        $seq = 1;
    }

    return sprintf('見積_%s_%s', $abbrKey, str_pad((string) $seq, 4, '0', STR_PAD_LEFT));
}

function estimateLoadLines(PDO $pdo, int $estimateId): array
{
    $stmt = $pdo->prepare(
        'SELECT id, sort_order, major_category, category, item_code, item_name, quantity, unit_type, unit_price, factor, line_amount
         FROM project_estimate_lines
         WHERE estimate_id = :id
         ORDER BY sort_order ASC, id ASC'
    );
    $stmt->execute([':id' => $estimateId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return is_array($rows) ? $rows : [];
}

function estimateUserIdExists(PDO $pdo, int $userId): bool
{
    if ($userId <= 0) {
        return false;
    }
    $chk = $pdo->prepare('SELECT id FROM users WHERE id = :id LIMIT 1');
    $chk->execute([':id' => $userId]);

    return $chk->fetchColumn() !== false;
}

function estimateIsAdminUser(PDO $pdo, int $userId): bool
{
    if ($userId <= 0) {
        return false;
    }
    try {
        $stmt = $pdo->prepare('SELECT is_admin FROM users WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $userId]);
        $v = $stmt->fetchColumn();
        return ((int)$v) === 1;
    } catch (Throwable $e) {
        error_log('[estimateIsAdminUser] ' . $e->getMessage());
        return false;
    }
}

function estimateLoadUserTeamTags(PDO $pdo, int $userId): array
{
    $teamTags = [];
    if ($userId <= 0) {
        return $teamTags;
    }
    try {
        $userStmt = $pdo->prepare('SELECT team FROM users WHERE id = :id LIMIT 1');
        $userStmt->execute([':id' => $userId]);
        $u = $userStmt->fetch(PDO::FETCH_ASSOC);
        if (is_array($u) && is_string($u['team'] ?? null) && trim($u['team']) !== '') {
            $decoded = json_decode((string)$u['team'], true);
            if (is_array($decoded)) {
                foreach ($decoded as $tag) {
                    if (is_string($tag) && trim($tag) !== '') {
                        $teamTags[strtolower(trim($tag))] = true;
                    }
                }
            }
        }
    } catch (Throwable $e) {
        error_log('[estimateLoadUserTeamTags] ' . $e->getMessage());
    }
    return $teamTags;
}

function estimateNormalizeTeamTagsCsvFromJson(mixed $raw): string
{
    if (!is_string($raw) || trim($raw) === '') {
        return '';
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return '';
    }
    $tags = [];
    foreach ($decoded as $tag) {
        if (!is_string($tag)) {
            continue;
        }
        $v = strtolower(trim($tag));
        if ($v === '') {
            continue;
        }
        $tags[$v] = true;
    }
    if ($tags === []) {
        return '';
    }
    $out = array_keys($tags);
    sort($out, SORT_STRING);
    return implode(',', $out);
}

function estimateResolveEffectiveRole(
    PDO $pdo,
    int $estimateId,
    int $sessionUserId,
    bool $isAdmin,
    array $teamTags,
    string $visibilityScope,
    int $createdByUserId
): string {
    if ($estimateId <= 0 || $sessionUserId <= 0) {
        return 'none';
    }
    if ($createdByUserId === $sessionUserId) {
        return 'owner';
    }
    if ($isAdmin) {
        return 'editor';
    }
    if ($visibilityScope === 'public_all_users') {
        return 'viewer';
    }

    return 'none';
}

function estimateResolveSalesUserIdForPost(PDO $pdo, array $payload, int $sessionUserId): int
{
    $out = $sessionUserId;
    if (!array_key_exists('sales_user_id', $payload)) {
        return $out;
    }
    $v = $payload['sales_user_id'];
    if ($v === null || $v === '' || !is_numeric($v)) {
        return $out;
    }
    $sid = (int)$v;
    if ($sid <= 0 || !estimateUserIdExists($pdo, $sid)) {
        return $out;
    }

    return $sid;
}

/** PATCH 用。キーが無いときは既存の sales_user_id を返す。 */
function estimateResolveSalesUserIdForPatch(PDO $pdo, array $payload, int $estimateId): ?int
{
    if (!array_key_exists('sales_user_id', $payload)) {
        $cur = $pdo->prepare('SELECT sales_user_id FROM project_estimates WHERE id = :id LIMIT 1');
        $cur->execute([':id' => $estimateId]);
        $col = $cur->fetchColumn();
        if ($col === false || $col === null) {
            return null;
        }

        return (int)$col;
    }
    $v = $payload['sales_user_id'];
    if ($v === null || $v === '') {
        return null;
    }
    if (!is_numeric($v)) {
        return null;
    }
    $sid = (int)$v;
    if ($sid <= 0) {
        return null;
    }
    if (!estimateUserIdExists($pdo, $sid)) {
        return null;
    }

    return $sid;
}

/**
 * @param list<mixed> $list
 * @return list<int>
 */
function estimateNormalizeProjectIdsFromList(PDO $pdo, array $list): array
{
    $out = [];
    $seen = [];
    $pchk = $pdo->prepare('SELECT id FROM projects WHERE id = :id LIMIT 1');
    foreach ($list as $v) {
        if (!is_numeric($v)) {
            continue;
        }
        $pid = (int)$v;
        if ($pid <= 0 || isset($seen[$pid])) {
            continue;
        }
        $pchk->execute([':id' => $pid]);
        if ($pchk->fetchColumn() === false) {
            continue;
        }
        $seen[$pid] = true;
        $out[] = $pid;
        if (count($out) >= 30) {
            break;
        }
    }

    return $out;
}

function estimateInsertOperationLog(PDO $pdo, ?int $estimateId, string $operationType, int $operatorUserId, array $detail): void
{
    $stmt = $pdo->prepare(
        'INSERT INTO estimate_operation_logs (estimate_id, operation_type, operator_user_id, detail_json)
         VALUES (:estimate_id, :operation_type, :operator_user_id, :detail_json)'
    );
    $stmt->execute([
        ':estimate_id' => $estimateId,
        ':operation_type' => $operationType,
        ':operator_user_id' => $operatorUserId,
        ':detail_json' => json_encode($detail, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    ]);
}

function estimateNormalizeScalarForDiff(mixed $v): string
{
    if ($v === null) {
        return '';
    }
    if (is_bool($v)) {
        return $v ? '1' : '0';
    }
    if (is_numeric($v)) {
        return (string)$v;
    }
    if (is_string($v)) {
        return trim($v);
    }
    return '';
}

function estimateBuildUpdateSummary(array $before, array $after, int $beforeLineCount, int $afterLineCount): string
{
    $labels = [
        'title' => '件名',
        'estimate_status' => 'ステータス',
        'client_name' => 'クライアント名',
        'client_abbr' => '略称',
        'recipient_text' => '見積先',
        'issue_date' => '発行日',
        'delivery_due_text' => '納入予定',
        'internal_memo' => '社内メモ',
        'remarks' => '備考',
        'sales_user_id' => '担当営業',
        'applied_tax_rate_percent' => '税率',
        'is_rough_estimate' => '概算フラグ',
    ];
    $changed = [];
    foreach ($labels as $key => $label) {
        $b = estimateNormalizeScalarForDiff($before[$key] ?? null);
        $a = estimateNormalizeScalarForDiff($after[$key] ?? null);
        if ($b !== $a) {
            $changed[] = $label;
        }
    }
    if ($beforeLineCount !== $afterLineCount) {
        $changed[] = '明細行数';
    }
    if (empty($changed)) {
        return '変更なし';
    }
    // 画面上の差分が分かりにくい（税率のみ等）ことがあるため、一覧は出さず固定文言にする
    return '更新';
}

/**
 * @return array{unit_type:string,price_type:string,price_value:float|null,price_min:float|null,price_max:float|null}|null
 */
function estimateResolveRuleItem(PDO $pdo, ?string $itemCode): ?array
{
    if ($itemCode === null || trim($itemCode) === '') {
        return null;
    }
    try {
        $stmt = $pdo->prepare(
            "SELECT eri.unit_type, eri.price_type, eri.price_value, eri.price_min, eri.price_max
             FROM estimate_rule_items eri
             INNER JOIN estimate_rule_sets ers ON ers.id = eri.rule_set_id
             WHERE eri.item_code = :item_code AND ers.status = 'active'
             ORDER BY eri.id DESC
             LIMIT 1"
        );
        $stmt->execute([':item_code' => trim($itemCode)]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!is_array($row)) {
            return null;
        }
        return [
            'unit_type' => is_string($row['unit_type'] ?? null) ? $row['unit_type'] : 'set',
            'price_type' => is_string($row['price_type'] ?? null) ? $row['price_type'] : 'fixed',
            'price_value' => isset($row['price_value']) && is_numeric($row['price_value']) ? (float)$row['price_value'] : null,
            'price_min' => isset($row['price_min']) && is_numeric($row['price_min']) ? (float)$row['price_min'] : null,
            'price_max' => isset($row['price_max']) && is_numeric($row['price_max']) ? (float)$row['price_max'] : null,
        ];
    } catch (Throwable $e) {
        error_log('[estimateResolveRuleItem] ' . $e->getMessage());
        return null;
    }
}

if ($method === 'GET') {
    $idRaw = $_GET['id'] ?? null;
    if (is_string($idRaw) && ctype_digit($idRaw)) {
        $estimateId = (int)$idRaw;
        $stmt = $pdo->prepare('SELECT * FROM project_estimates WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $estimateId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!is_array($row)) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => '見積が見つかりません。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $isAdmin = estimateIsAdminUser($pdo, $sessionUserId);
        $teamTags = estimateLoadUserTeamTags($pdo, $sessionUserId);
        $visibility = isset($row['visibility_scope']) && is_string($row['visibility_scope']) ? $row['visibility_scope'] : 'public_all_users';
        $createdBy = (int)($row['created_by_user_id'] ?? 0);
        $effectiveRole = estimateResolveEffectiveRole($pdo, $estimateId, $sessionUserId, $isAdmin, $teamTags, $visibility, $createdBy);
        if ($effectiveRole === 'none') {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'この見積を閲覧する権限がありません。'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $row['effective_role'] = $effectiveRole;
        $row['lines'] = estimateLoadLines($pdo, $estimateId);
        $linkStmt = $pdo->prepare(
            'SELECT project_id FROM estimate_project_links WHERE estimate_id = :id ORDER BY CASE link_type WHEN \'primary\' THEN 0 ELSE 1 END, id ASC'
        );
        $linkStmt->execute([':id' => $estimateId]);
        $projectIds = [];
        while ($lr = $linkStmt->fetch(PDO::FETCH_ASSOC)) {
            if (is_array($lr) && isset($lr['project_id']) && is_numeric($lr['project_id'])) {
                $projectIds[] = (int)$lr['project_id'];
            }
        }
        if ($projectIds === []) {
            $pidCol = isset($row['project_id']) && is_numeric($row['project_id']) ? (int)$row['project_id'] : 0;
            if ($pidCol > 0) {
                $projectIds = [$pidCol];
            }
        }
        $row['project_ids'] = $projectIds;
        echo json_encode(['success' => true, 'estimate' => $row], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $statusFilter = isset($_GET['status']) && is_string($_GET['status']) ? trim($_GET['status']) : '';
    $statusCsv = isset($_GET['status_csv']) && is_string($_GET['status_csv']) ? trim($_GET['status_csv']) : '';
    $projectIdFilter = isset($_GET['project_id']) && is_string($_GET['project_id']) && ctype_digit($_GET['project_id']) ? (int)$_GET['project_id'] : 0;
    $salesFilter = isset($_GET['sales_user_id']) && is_string($_GET['sales_user_id']) && ctype_digit($_GET['sales_user_id']) ? (int)$_GET['sales_user_id'] : 0;
    $teamTagFilter = isset($_GET['team_tag']) && is_string($_GET['team_tag']) ? strtolower(trim($_GET['team_tag'])) : '';
    $ownerTeamTagFilter = isset($_GET['owner_team_tag']) && is_string($_GET['owner_team_tag']) ? strtolower(trim($_GET['owner_team_tag'])) : '';
    $updatedFrom = isset($_GET['updated_from']) && is_string($_GET['updated_from']) ? trim($_GET['updated_from']) : '';
    $updatedTo = isset($_GET['updated_to']) && is_string($_GET['updated_to']) ? trim($_GET['updated_to']) : '';
    $keyword = isset($_GET['keyword']) && is_string($_GET['keyword']) ? trim($_GET['keyword']) : '';
    $page = isset($_GET['page']) && is_string($_GET['page']) && ctype_digit($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
    $pageSize = isset($_GET['page_size']) && is_string($_GET['page_size']) && ctype_digit($_GET['page_size']) ? (int)$_GET['page_size'] : 20;
    if ($pageSize <= 0) {
        $pageSize = 20;
    }
    if ($pageSize > 100) {
        $pageSize = 100;
    }
    $offset = ($page - 1) * $pageSize;

    $isAdmin = estimateIsAdminUser($pdo, $sessionUserId);
    $teamTags = estimateLoadUserTeamTags($pdo, $sessionUserId);

    $where = [];
    $params = [];

    $statusList = [];
    if ($statusCsv !== '') {
        foreach (explode(',', $statusCsv) as $s) {
            $x = trim($s);
            if (in_array($x, ['draft', 'submitted', 'won', 'lost'], true)) {
                $statusList[$x] = true;
            }
        }
    }
    if ($statusList === [] && $statusFilter !== '' && in_array($statusFilter, ['draft', 'submitted', 'won', 'lost'], true)) {
        $statusList[$statusFilter] = true;
    }
    $statusValues = array_keys($statusList);
    if (count($statusValues) === 1) {
        $where[] = 'pe.estimate_status = :status_filter';
        $params[':status_filter'] = $statusValues[0];
    } elseif (count($statusValues) > 1) {
        $statusPh = [];
        foreach ($statusValues as $i => $sv) {
            $ph = ':status_filter_' . $i;
            $statusPh[] = $ph;
            $params[$ph] = $sv;
        }
        $where[] = 'pe.estimate_status IN (' . implode(',', $statusPh) . ')';
    }
    if ($projectIdFilter > 0) {
        $where[] = 'pe.project_id = :project_id_filter';
        $params[':project_id_filter'] = $projectIdFilter;
    }
    if ($salesFilter > 0) {
        $where[] = 'pe.sales_user_id = :sales_filter';
        $params[':sales_filter'] = $salesFilter;
    }
    if ($updatedFrom !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $updatedFrom) === 1) {
        $where[] = 'DATE(pe.updated_at) >= :updated_from';
        $params[':updated_from'] = $updatedFrom;
    }
    if ($updatedTo !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $updatedTo) === 1) {
        $where[] = 'DATE(pe.updated_at) <= :updated_to';
        $params[':updated_to'] = $updatedTo;
    }
    if ($keyword !== '') {
        $where[] = '(
            pe.estimate_number LIKE :keyword
            OR pe.title LIKE :keyword
            OR pe.client_name LIKE :keyword
            OR pe.recipient_text LIKE :keyword
            OR pe.internal_memo LIKE :keyword
        )';
        $params[':keyword'] = '%' . $keyword . '%';
    }
    if ($teamTagFilter !== '') {
        $where[] = 'EXISTS (SELECT 1 FROM estimate_team_permissions etf WHERE etf.estimate_id = pe.id AND etf.team_tag = :team_tag_filter)';
        $params[':team_tag_filter'] = $teamTagFilter;
    }
    if ($ownerTeamTagFilter !== '') {
        $where[] = 'LOWER(COALESCE(owner_u.team, \'\')) LIKE :owner_team_tag_filter';
        $params[':owner_team_tag_filter'] = '%"' . $ownerTeamTagFilter . '"%';
    }

    $permOr = [];
    $permOr[] = "pe.visibility_scope = 'public_all_users'";
    $permOr[] = 'pe.created_by_user_id = :session_user_id_created';
    $params[':session_user_id_created'] = $sessionUserId;
    if ($isAdmin) {
        $permOr[] = '1=1';
    }
    $where[] = '(' . implode(' OR ', $permOr) . ')';
    $whereSql = $where === [] ? '' : ('WHERE ' . implode(' AND ', $where));

    $countSql = 'SELECT COUNT(*) FROM project_estimates pe LEFT JOIN users owner_u ON owner_u.id = pe.created_by_user_id ' . $whereSql;
    $countStmt = $pdo->prepare($countSql);
    foreach ($params as $k => $v) {
        $countStmt->bindValue($k, $v);
    }
    $countStmt->execute();
    $total = (int)$countStmt->fetchColumn();

    $sql =
        'SELECT pe.id,
                pe.project_id,
                pe.estimate_number,
                pe.estimate_status,
                pe.title,
                pe.client_name,
                pe.client_abbr,
                pe.issue_date,
                pe.sales_user_id,
                COALESCE(NULLIF(TRIM(u.display_name), \'\'), NULLIF(TRIM(u.email), \'\')) AS sales_user_label,
                pe.visibility_scope,
                pe.created_by_user_id,
                pe.total_including_tax,
                pe.updated_at,
                owner_u.team AS owner_team_tags_json,
                (
                    SELECT GROUP_CONCAT(DISTINCT etp.team_tag ORDER BY etp.team_tag SEPARATOR ",")
                    FROM estimate_team_permissions etp
                    WHERE etp.estimate_id = pe.id
                ) AS team_tags_csv
         FROM project_estimates pe
         LEFT JOIN users u ON u.id = pe.sales_user_id
         LEFT JOIN users owner_u ON owner_u.id = pe.created_by_user_id
         ' . $whereSql . '
         ORDER BY pe.updated_at DESC, pe.id DESC
         LIMIT :limit OFFSET :offset';
    $stmt = $pdo->prepare($sql);
    foreach ($params as $k => $v) {
        $stmt->bindValue($k, $v);
    }
    $stmt->bindValue(':limit', $pageSize, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $estimates = [];
    if (is_array($rows)) {
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $estimateId = (int)($row['id'] ?? 0);
            if ($estimateId <= 0) {
                continue;
            }
            $visibility = isset($row['visibility_scope']) && is_string($row['visibility_scope']) ? $row['visibility_scope'] : 'public_all_users';
            $effectiveRole = estimateResolveEffectiveRole(
                $pdo,
                $estimateId,
                $sessionUserId,
                $isAdmin,
                $teamTags,
                $visibility,
                (int)($row['created_by_user_id'] ?? 0)
            );
            if ($effectiveRole === 'none') {
                continue;
            }
            $row['effective_role'] = $effectiveRole;
            $row['owner_team_tags_csv'] = estimateNormalizeTeamTagsCsvFromJson($row['owner_team_tags_json'] ?? null);
            unset($row['owner_team_tags_json']);
            $estimates[] = $row;
        }
    }
    echo json_encode(
        [
            'success' => true,
            'estimates' => $estimates,
            'page' => $page,
            'page_size' => $pageSize,
            'total' => $total,
        ],
        JSON_UNESCAPED_UNICODE
    );
    exit;
}

if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw !== false ? $raw : '', true);
    if (!is_array($payload)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'JSON ボディが不正です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $issueDate = isset($payload['issue_date']) && is_string($payload['issue_date']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $payload['issue_date']) === 1
        ? $payload['issue_date']
        : (new DateTimeImmutable('now'))->format('Y-m-d');
    $clientName = isset($payload['client_name']) && is_string($payload['client_name']) ? trim($payload['client_name']) : null;
    $title = isset($payload['title']) && is_string($payload['title']) && trim($payload['title']) !== '' ? trim($payload['title']) : '新規見積';
    $status = estimateNormalizeStatus($payload['estimate_status'] ?? 'draft');
    $visibility = (isset($payload['visibility_scope']) && $payload['visibility_scope'] === 'restricted') ? 'restricted' : 'public_all_users';
    $recipientText = isset($payload['recipient_text']) && is_string($payload['recipient_text']) ? $payload['recipient_text'] : null;
    $remarks = isset($payload['remarks']) && is_string($payload['remarks']) ? $payload['remarks'] : null;
    $internalMemo = isset($payload['internal_memo']) && is_string($payload['internal_memo']) ? $payload['internal_memo'] : null;
    $deliveryDueText = null;
    if (isset($payload['delivery_due_text']) && is_string($payload['delivery_due_text'])) {
        $dt = trim($payload['delivery_due_text']);
        if ($dt !== '') {
            $deliveryDueText = mb_strlen($dt, 'UTF-8') > 255 ? mb_substr($dt, 0, 255, 'UTF-8') : $dt;
        }
    }
    $isRough = ($payload['is_rough_estimate'] ?? false) ? 1 : 0;
    $linkedProjectIdsPost = [];
    if (array_key_exists('project_ids', $payload) && is_array($payload['project_ids'])) {
        $linkedProjectIdsPost = estimateNormalizeProjectIdsFromList($pdo, $payload['project_ids']);
    } elseif (isset($payload['project_id']) && is_numeric($payload['project_id']) && (int)$payload['project_id'] > 0) {
        $linkedProjectIdsPost = estimateNormalizeProjectIdsFromList($pdo, [(int)$payload['project_id']]);
    }
    $projectId = $linkedProjectIdsPost[0] ?? null;
    $clientAbbr = isset($payload['client_abbr']) && is_string($payload['client_abbr']) ? trim($payload['client_abbr']) : '';
    $estimateNumber = estimateGenerateNumber($pdo, $clientAbbr);
    $clientAbbrStored = $clientAbbr === '' ? null : (mb_strlen($clientAbbr, 'UTF-8') <= 64 ? $clientAbbr : mb_substr($clientAbbr, 0, 64, 'UTF-8'));

    $lines = isset($payload['lines']) && is_array($payload['lines']) ? $payload['lines'] : [];
    $subtotal = 0.0;
    $normalizedLines = [];
    foreach ($lines as $i => $line) {
        if (!is_array($line)) {
            continue;
        }
        $quantity = isset($line['quantity']) && is_numeric($line['quantity']) ? (float)$line['quantity'] : 0.0;
        $unitPrice = isset($line['unit_price']) && is_numeric($line['unit_price']) ? (float)$line['unit_price'] : 0.0;
        $factor = isset($line['factor']) && is_numeric($line['factor']) ? (float)$line['factor'] : 1.0;
        $itemCode = isset($line['item_code']) && is_string($line['item_code']) ? $line['item_code'] : null;
        $rule = estimateResolveRuleItem($pdo, $itemCode);
        $unitType = isset($line['unit_type']) && is_string($line['unit_type']) ? $line['unit_type'] : 'set';
        if ($rule !== null) {
            $unitType = $rule['unit_type'];
            if ($rule['price_type'] === 'fixed' && $rule['price_value'] !== null) {
                $unitPrice = $rule['price_value'];
            } elseif ($rule['price_type'] === 'range' && $rule['price_value'] !== null && $rule['price_min'] !== null && $rule['price_max'] !== null) {
                if ($quantity >= $rule['price_min'] && $quantity <= $rule['price_max']) {
                    $unitPrice = $rule['price_value'];
                }
            } elseif ($rule['price_type'] === 'multiplier' && $rule['price_value'] !== null) {
                $unitPrice = $unitPrice * $rule['price_value'];
            } elseif ($rule['price_type'] === 'percentage' && $rule['price_value'] !== null) {
                $unitPrice = $unitPrice * ($rule['price_value'] / 100);
            }
        }
        if ($unitType === 'person_day' && isset($line['convert_to_month']) && (bool)$line['convert_to_month'] === true) {
            $quantity = round($quantity / 20, 4);
            $unitType = 'person_month';
        } elseif ($unitType === 'person_month' && isset($line['convert_to_day']) && (bool)$line['convert_to_day'] === true) {
            $quantity = round($quantity * 20, 4);
            $unitType = 'person_day';
        }
        $amount = estimateComputeLineAmount($unitType, $quantity, $unitPrice, $factor);
        $subtotal += $amount;
        $normalizedLines[] = [
            'sort_order' => $i,
            'major_category' => isset($line['major_category']) && is_string($line['major_category']) ? $line['major_category'] : null,
            'category' => isset($line['category']) && is_string($line['category']) ? $line['category'] : null,
            'item_code' => $itemCode,
            'item_name' => isset($line['item_name']) && is_string($line['item_name']) ? $line['item_name'] : '',
            'quantity' => $quantity,
            'unit_type' => $unitType,
            'unit_price' => $unitPrice,
            'factor' => $factor,
            'line_amount' => $amount,
        ];
    }

    $taxSelected = estimateResolveTaxRate($pdo, $issueDate);
    $taxPercent = isset($payload['applied_tax_rate_percent']) && is_numeric($payload['applied_tax_rate_percent'])
        ? (float)$payload['applied_tax_rate_percent']
        : (float)$taxSelected['percent'];
    $taxAmount = floor($subtotal * $taxPercent / 100);
    $total = $subtotal + $taxAmount;
    $salesUserIdIns = estimateResolveSalesUserIdForPost($pdo, $payload, $sessionUserId);

    try {
        $pdo->beginTransaction();
        $ins = $pdo->prepare(
            'INSERT INTO project_estimates
             (project_id, estimate_number, estimate_status, title, is_rough_estimate, client_name, client_abbr, recipient_text, remarks, issue_date, delivery_due_text, visibility_scope, internal_memo,
              applied_tax_rate_percent, applied_tax_effective_from, subtotal_excluding_tax, tax_amount, total_including_tax, sales_user_id, created_by_user_id, updated_by_user_id)
             VALUES
             (:project_id, :estimate_number, :estimate_status, :title, :is_rough_estimate, :client_name, :client_abbr, :recipient_text, :remarks, :issue_date, :delivery_due_text, :visibility_scope, :internal_memo,
              :applied_tax_rate_percent, :applied_tax_effective_from, :subtotal_excluding_tax, :tax_amount, :total_including_tax, :sales_user_id, :created_by_user_id, :updated_by_user_id)'
        );
        $ins->execute([
            ':project_id' => $projectId,
            ':estimate_number' => $estimateNumber,
            ':estimate_status' => $status,
            ':title' => $title,
            ':is_rough_estimate' => $isRough,
            ':client_name' => $clientName,
            ':client_abbr' => $clientAbbrStored,
            ':recipient_text' => $recipientText,
            ':remarks' => $remarks,
            ':issue_date' => $issueDate,
            ':delivery_due_text' => $deliveryDueText,
            ':visibility_scope' => $visibility,
            ':internal_memo' => $internalMemo,
            ':applied_tax_rate_percent' => $taxPercent,
            ':applied_tax_effective_from' => $taxSelected['effective_from'],
            ':subtotal_excluding_tax' => $subtotal,
            ':tax_amount' => $taxAmount,
            ':total_including_tax' => $total,
            ':sales_user_id' => $salesUserIdIns,
            ':created_by_user_id' => $sessionUserId,
            ':updated_by_user_id' => $sessionUserId,
        ]);
        $estimateId = (int)$pdo->lastInsertId();

        if ($normalizedLines !== []) {
            $insLine = $pdo->prepare(
                'INSERT INTO project_estimate_lines
                 (estimate_id, sort_order, major_category, category, item_code, item_name, quantity, unit_type, unit_price, factor, line_amount)
                 VALUES
                 (:estimate_id, :sort_order, :major_category, :category, :item_code, :item_name, :quantity, :unit_type, :unit_price, :factor, :line_amount)'
            );
            foreach ($normalizedLines as $line) {
                $insLine->execute([
                    ':estimate_id' => $estimateId,
                    ':sort_order' => $line['sort_order'],
                    ':major_category' => $line['major_category'],
                    ':category' => $line['category'],
                    ':item_code' => $line['item_code'],
                    ':item_name' => $line['item_name'],
                    ':quantity' => $line['quantity'],
                    ':unit_type' => $line['unit_type'],
                    ':unit_price' => $line['unit_price'],
                    ':factor' => $line['factor'],
                    ':line_amount' => $line['line_amount'],
                ]);
            }
        }
        estimateInsertOperationLog(
            $pdo,
            $estimateId,
            'estimate_created',
            $sessionUserId,
            [
                'summary' => '新規登録: 見積を作成',
                'estimate_number' => $estimateNumber,
                'status' => $status,
                'visibility_scope' => $visibility,
                'line_count' => count($normalizedLines),
                'subtotal_excluding_tax' => $subtotal,
                'tax_amount' => $taxAmount,
                'total_including_tax' => $total,
            ]
        );
        if ($linkedProjectIdsPost !== []) {
            $linkIns = $pdo->prepare(
                'INSERT INTO estimate_project_links (estimate_id, project_id, link_type) VALUES (:estimate_id, :project_id, :link_type)'
            );
            foreach ($linkedProjectIdsPost as $i => $pid) {
                $linkType = $i === 0 ? 'primary' : 'related';
                $linkIns->execute([
                    ':estimate_id' => $estimateId,
                    ':project_id' => $pid,
                    ':link_type' => $linkType,
                ]);
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[estimates POST] ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => '見積の保存に失敗しました。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode(['success' => true, 'id' => $estimateId, 'estimate_number' => $estimateNumber], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'PATCH') {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw !== false ? $raw : '', true);
    if (!is_array($payload)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'JSON ボディが不正です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $estimateId = isset($payload['id']) && is_numeric($payload['id']) ? (int)$payload['id'] : 0;
    if ($estimateId <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'id は必須です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $stmt = $pdo->prepare('SELECT id, visibility_scope, created_by_user_id FROM project_estimates WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $estimateId]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($existing === false || !is_array($existing)) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => '見積が見つかりません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $effectiveRole = estimateResolveEffectiveRole(
        $pdo,
        $estimateId,
        $sessionUserId,
        estimateIsAdminUser($pdo, $sessionUserId),
        estimateLoadUserTeamTags($pdo, $sessionUserId),
        is_string($existing['visibility_scope'] ?? null) ? (string)$existing['visibility_scope'] : 'public_all_users',
        (int)($existing['created_by_user_id'] ?? 0)
    );
    if (!in_array($effectiveRole, ['owner', 'editor'], true)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => '見積を編集する権限がありません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $beforeStmt = $pdo->prepare('SELECT * FROM project_estimates WHERE id = :id LIMIT 1');
    $beforeStmt->execute([':id' => $estimateId]);
    $beforeEstimate = $beforeStmt->fetch(PDO::FETCH_ASSOC);
    $beforeLines = estimateLoadLines($pdo, $estimateId);
    $title = isset($payload['title']) && is_string($payload['title']) ? trim($payload['title']) : '見積';
    $status = estimateNormalizeStatus($payload['estimate_status'] ?? 'draft');
    $recipientText = isset($payload['recipient_text']) && is_string($payload['recipient_text']) ? $payload['recipient_text'] : null;
    $remarks = isset($payload['remarks']) && is_string($payload['remarks']) ? $payload['remarks'] : null;
    $internalMemo = isset($payload['internal_memo']) && is_string($payload['internal_memo']) ? $payload['internal_memo'] : null;
    $isRough = ($payload['is_rough_estimate'] ?? false) ? 1 : 0;
    $clientName = isset($payload['client_name']) && is_string($payload['client_name']) ? trim($payload['client_name']) : null;
    $clientAbbrPatch = null;
    if (array_key_exists('client_abbr', $payload)) {
        if ($payload['client_abbr'] === null || $payload['client_abbr'] === '') {
            $clientAbbrPatch = null;
        } elseif (is_string($payload['client_abbr'])) {
            $cab = trim($payload['client_abbr']);
            $clientAbbrPatch = $cab === '' ? null : (mb_strlen($cab, 'UTF-8') <= 64 ? $cab : mb_substr($cab, 0, 64, 'UTF-8'));
        }
    }
    $issueDatePatch = isset($payload['issue_date']) && is_string($payload['issue_date']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $payload['issue_date']) === 1
        ? $payload['issue_date']
        : null;
    $deliveryDueTextPatch = null;
    if (array_key_exists('delivery_due_text', $payload)) {
        if ($payload['delivery_due_text'] === null || $payload['delivery_due_text'] === '') {
            $deliveryDueTextPatch = null;
        } elseif (is_string($payload['delivery_due_text'])) {
            $dt = trim($payload['delivery_due_text']);
            $deliveryDueTextPatch = $dt !== '' ? (mb_strlen($dt, 'UTF-8') <= 255 ? $dt : mb_substr($dt, 0, 255, 'UTF-8')) : null;
        }
    }
    $clientAbbrSummary = array_key_exists('client_abbr', $payload)
        ? $clientAbbrPatch
        : (is_array($beforeEstimate) ? ($beforeEstimate['client_abbr'] ?? null) : null);
    $issueDateSummary = $issueDatePatch !== null
        ? $issueDatePatch
        : (is_array($beforeEstimate) ? ($beforeEstimate['issue_date'] ?? null) : null);
    $deliveryDueSummary = array_key_exists('delivery_due_text', $payload)
        ? $deliveryDueTextPatch
        : (is_array($beforeEstimate) ? ($beforeEstimate['delivery_due_text'] ?? null) : null);

    $lines = isset($payload['lines']) && is_array($payload['lines']) ? $payload['lines'] : [];
    $subtotal = 0.0;
    $normalizedLines = [];
    foreach ($lines as $i => $line) {
        if (!is_array($line)) {
            continue;
        }
        $quantity = isset($line['quantity']) && is_numeric($line['quantity']) ? (float)$line['quantity'] : 0.0;
        $unitPrice = isset($line['unit_price']) && is_numeric($line['unit_price']) ? (float)$line['unit_price'] : 0.0;
        $factor = isset($line['factor']) && is_numeric($line['factor']) ? (float)$line['factor'] : 1.0;
        $itemCode = isset($line['item_code']) && is_string($line['item_code']) ? $line['item_code'] : null;
        $rule = estimateResolveRuleItem($pdo, $itemCode);
        $unitType = isset($line['unit_type']) && is_string($line['unit_type']) ? $line['unit_type'] : 'set';
        if ($rule !== null) {
            $unitType = $rule['unit_type'];
            if ($rule['price_type'] === 'fixed' && $rule['price_value'] !== null) {
                $unitPrice = $rule['price_value'];
            } elseif ($rule['price_type'] === 'range' && $rule['price_value'] !== null && $rule['price_min'] !== null && $rule['price_max'] !== null) {
                if ($quantity >= $rule['price_min'] && $quantity <= $rule['price_max']) {
                    $unitPrice = $rule['price_value'];
                }
            } elseif ($rule['price_type'] === 'multiplier' && $rule['price_value'] !== null) {
                $unitPrice = $unitPrice * $rule['price_value'];
            } elseif ($rule['price_type'] === 'percentage' && $rule['price_value'] !== null) {
                $unitPrice = $unitPrice * ($rule['price_value'] / 100);
            }
        }
        if ($unitType === 'person_day' && isset($line['convert_to_month']) && (bool)$line['convert_to_month'] === true) {
            $quantity = round($quantity / 20, 4);
            $unitType = 'person_month';
        } elseif ($unitType === 'person_month' && isset($line['convert_to_day']) && (bool)$line['convert_to_day'] === true) {
            $quantity = round($quantity * 20, 4);
            $unitType = 'person_day';
        }
        $amount = estimateComputeLineAmount($unitType, $quantity, $unitPrice, $factor);
        $subtotal += $amount;
        $normalizedLines[] = [
            'sort_order' => $i,
            'major_category' => isset($line['major_category']) && is_string($line['major_category']) ? $line['major_category'] : null,
            'category' => isset($line['category']) && is_string($line['category']) ? $line['category'] : null,
            'item_code' => $itemCode,
            'item_name' => isset($line['item_name']) && is_string($line['item_name']) ? $line['item_name'] : '',
            'quantity' => $quantity,
            'unit_type' => $unitType,
            'unit_price' => $unitPrice,
            'factor' => $factor,
            'line_amount' => $amount,
        ];
    }
    $taxPercent = isset($payload['applied_tax_rate_percent']) && is_numeric($payload['applied_tax_rate_percent']) ? (float)$payload['applied_tax_rate_percent'] : 10.0;
    $taxAmount = floor($subtotal * $taxPercent / 100);
    $total = $subtotal + $taxAmount;
    $salesUserIdPatch = estimateResolveSalesUserIdForPatch($pdo, $payload, $estimateId);

    try {
        $pdo->beginTransaction();
        $projectPatchUseIds = array_key_exists('project_ids', $payload) || array_key_exists('project_id', $payload);
        $linkedPatchIds = [];
        if (array_key_exists('project_ids', $payload) && is_array($payload['project_ids'])) {
            $linkedPatchIds = estimateNormalizeProjectIdsFromList($pdo, $payload['project_ids']);
        } elseif (array_key_exists('project_id', $payload)) {
            $pidRaw = $payload['project_id'];
            if ($pidRaw === null || $pidRaw === '' || $pidRaw === false) {
                $linkedPatchIds = [];
            } elseif (is_numeric($pidRaw) && (int)$pidRaw > 0) {
                $linkedPatchIds = estimateNormalizeProjectIdsFromList($pdo, [(int)$pidRaw]);
            }
        }
        $issueDateSql = $issueDatePatch !== null ? 'issue_date = :issue_date,' : '';
        $deliverySql = array_key_exists('delivery_due_text', $payload) ? 'delivery_due_text = :delivery_due_text,' : '';
        $clientAbbrSql = array_key_exists('client_abbr', $payload) ? 'client_abbr = :client_abbr,' : '';
        $visibilitySql = array_key_exists('visibility_scope', $payload) ? 'visibility_scope = :visibility_scope,' : '';
        $projectIdSql = $projectPatchUseIds ? 'project_id = :project_id,' : '';
        $upd = $pdo->prepare(
            'UPDATE project_estimates SET
             estimate_status = :estimate_status,
             title = :title,
             is_rough_estimate = :is_rough_estimate,
             ' . $clientAbbrSql . '
             client_name = :client_name,
             recipient_text = :recipient_text,
             remarks = :remarks,
             internal_memo = :internal_memo,
             ' . $issueDateSql . '
             ' . $deliverySql . '
             ' . $visibilitySql . '
             ' . $projectIdSql . '
             applied_tax_rate_percent = :applied_tax_rate_percent,
             subtotal_excluding_tax = :subtotal_excluding_tax,
             tax_amount = :tax_amount,
             total_including_tax = :total_including_tax,
             sales_user_id = :sales_user_id,
             updated_by_user_id = :updated_by_user_id
             WHERE id = :id'
        );
        $execParams = [
            ':estimate_status' => $status,
            ':title' => $title,
            ':is_rough_estimate' => $isRough,
            ':client_name' => $clientName,
            ':recipient_text' => $recipientText,
            ':remarks' => $remarks,
            ':internal_memo' => $internalMemo,
            ':applied_tax_rate_percent' => $taxPercent,
            ':subtotal_excluding_tax' => $subtotal,
            ':tax_amount' => $taxAmount,
            ':total_including_tax' => $total,
            ':sales_user_id' => $salesUserIdPatch,
            ':updated_by_user_id' => $sessionUserId,
            ':id' => $estimateId,
        ];
        if ($issueDatePatch !== null) {
            $execParams[':issue_date'] = $issueDatePatch;
        }
        if (array_key_exists('delivery_due_text', $payload)) {
            $execParams[':delivery_due_text'] = $deliveryDueTextPatch;
        }
        if (array_key_exists('client_abbr', $payload)) {
            $execParams[':client_abbr'] = $clientAbbrPatch;
        }
        if (array_key_exists('visibility_scope', $payload)) {
            $vs = $payload['visibility_scope'];
            $execParams[':visibility_scope'] = ($vs === 'restricted') ? 'restricted' : 'public_all_users';
        }
        if ($projectPatchUseIds) {
            $execParams[':project_id'] = $linkedPatchIds[0] ?? null;
        }
        $upd->execute($execParams);

        if (array_key_exists('visibility_scope', $payload)) {
            $pdo->prepare('DELETE FROM estimate_team_permissions WHERE estimate_id = :id')->execute([':id' => $estimateId]);
            $pdo->prepare('DELETE FROM estimate_user_permissions WHERE estimate_id = :id')->execute([':id' => $estimateId]);
        }

        if ($projectPatchUseIds) {
            $pdo->prepare('DELETE FROM estimate_project_links WHERE estimate_id = :id')->execute([':id' => $estimateId]);
            if ($linkedPatchIds !== []) {
                $linkIns = $pdo->prepare(
                    'INSERT INTO estimate_project_links (estimate_id, project_id, link_type) VALUES (:estimate_id, :project_id, :link_type)'
                );
                foreach ($linkedPatchIds as $i => $pid) {
                    $linkType = $i === 0 ? 'primary' : 'related';
                    $linkIns->execute([
                        ':estimate_id' => $estimateId,
                        ':project_id' => $pid,
                        ':link_type' => $linkType,
                    ]);
                }
            }
        }

        $pdo->prepare('DELETE FROM project_estimate_lines WHERE estimate_id = :id')->execute([':id' => $estimateId]);
        if ($normalizedLines !== []) {
            $insLine = $pdo->prepare(
                'INSERT INTO project_estimate_lines
                 (estimate_id, sort_order, major_category, category, item_code, item_name, quantity, unit_type, unit_price, factor, line_amount)
                 VALUES
                 (:estimate_id, :sort_order, :major_category, :category, :item_code, :item_name, :quantity, :unit_type, :unit_price, :factor, :line_amount)'
            );
            foreach ($normalizedLines as $line) {
                $insLine->execute([
                    ':estimate_id' => $estimateId,
                    ':sort_order' => $line['sort_order'],
                    ':major_category' => $line['major_category'],
                    ':category' => $line['category'],
                    ':item_code' => $line['item_code'],
                    ':item_name' => $line['item_name'],
                    ':quantity' => $line['quantity'],
                    ':unit_type' => $line['unit_type'],
                    ':unit_price' => $line['unit_price'],
                    ':factor' => $line['factor'],
                    ':line_amount' => $line['line_amount'],
                ]);
            }
        }
        estimateInsertOperationLog(
            $pdo,
            $estimateId,
            'estimate_updated',
            $sessionUserId,
            [
                'summary' => estimateBuildUpdateSummary(
                    is_array($beforeEstimate) ? $beforeEstimate : [],
                    [
                        'title' => $title,
                        'estimate_status' => $status,
                        'client_name' => $clientName,
                        'client_abbr' => $clientAbbrSummary,
                        'recipient_text' => $recipientText,
                        'issue_date' => $issueDateSummary,
                        'delivery_due_text' => $deliveryDueSummary,
                        'internal_memo' => $internalMemo,
                        'remarks' => $remarks,
                        'sales_user_id' => $salesUserIdPatch,
                        'applied_tax_rate_percent' => $taxPercent,
                        'is_rough_estimate' => $isRough,
                    ],
                    is_array($beforeLines) ? count($beforeLines) : 0,
                    count($normalizedLines)
                ),
                'status' => $status,
                'line_count' => count($normalizedLines),
                'subtotal_excluding_tax' => $subtotal,
                'tax_amount' => $taxAmount,
                'total_including_tax' => $total,
            ]
        );
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[estimates PATCH] ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => '見積の更新に失敗しました。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'DELETE') {
    $idRaw = $_GET['id'] ?? '';
    if (!is_string($idRaw) || !ctype_digit($idRaw)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'id を指定してください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $id = (int)$idRaw;
    $ownerStmt = $pdo->prepare('SELECT created_by_user_id FROM project_estimates WHERE id = :id LIMIT 1');
    $ownerStmt->execute([':id' => $id]);
    $ownerRow = $ownerStmt->fetch(PDO::FETCH_ASSOC);
    if (!is_array($ownerRow)) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => '見積が見つかりません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $isAdmin = estimateIsAdminUser($pdo, $sessionUserId);
    $isCreator = (int)($ownerRow['created_by_user_id'] ?? 0) === $sessionUserId;
    if (!$isAdmin && !$isCreator) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => '削除権限がありません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    try {
        $pdo->beginTransaction();
        $pdo->prepare('DELETE FROM project_estimate_lines WHERE estimate_id = :id')->execute([':id' => $id]);
        $pdo->prepare('DELETE FROM project_estimates WHERE id = :id')->execute([':id' => $id]);
        estimateInsertOperationLog(
            $pdo,
            $id,
            'estimate_deleted',
            $sessionUserId,
            ['estimate_id' => $id, 'summary' => '削除: 見積を削除']
        );
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[estimates DELETE] ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => '見積の削除に失敗しました。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'GET / POST / PATCH / DELETE で実行してください。'], JSON_UNESCAPED_UNICODE);
