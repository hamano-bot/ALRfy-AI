<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__, 2) . '/auth/permission_helper.php';
require_once dirname(__DIR__) . '/includes/project_registration_schema.php';
require_once dirname(__DIR__) . '/includes/project_registration_parse.php';
require_once dirname(__DIR__) . '/includes/user_display_name_schema.php';

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
} catch (Throwable $e) {
    error_log('[platform-common/get_patch_project pdo] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'データベース接続に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    ensureProjectRegistrationSchema($pdo);
    ensureUserDisplayNameColumn($pdo);
} catch (Throwable $e) {
    error_log('[platform-common/get_patch_project ensure schema] ' . $e->getMessage());
    http_response_code(500);
    $msg = 'スキーマ（マイグレーション）を確認してください。';
    if ($e instanceof RuntimeException && str_contains($e->getMessage(), '20260417')) {
        $msg = $e->getMessage();
    }
    echo json_encode(['success' => false, 'message' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * @return array<string,mixed>|null
 */
function buildProjectAggregate(PDO $pdo, int $projectId, ?string $effectiveRole = null): ?array
{
    $stmt = $pdo->prepare(
        'SELECT p.id, p.name, p.slug, p.client_name, p.site_type, p.site_type_other,
                p.project_category, p.is_renewal, p.kickoff_date, p.release_due_date, p.is_released
         FROM projects p
         WHERE p.id = :id
         LIMIT 1'
    );
    $stmt->execute([':id' => $projectId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row === false) {
        return null;
    }

    $kick = $row['kickoff_date'] ?? null;
    $rel = $row['release_due_date'] ?? null;

    $renewalUrls = [];
    $uStmt = $pdo->prepare(
        'SELECT url FROM project_renewal_urls WHERE project_id = :pid ORDER BY sort_order ASC, id ASC'
    );
    $uStmt->execute([':pid' => $projectId]);
    $uRows = $uStmt->fetchAll(PDO::FETCH_ASSOC);
    if (is_array($uRows)) {
        foreach ($uRows as $ur) {
            if (is_array($ur) && isset($ur['url']) && is_string($ur['url']) && $ur['url'] !== '') {
                $renewalUrls[] = $ur['url'];
            }
        }
    }

    $redmineLinks = [];
    $rStmt = $pdo->prepare(
        'SELECT redmine_project_id, redmine_base_url, redmine_project_name FROM project_redmine_links
         WHERE project_id = :pid ORDER BY sort_order ASC, id ASC'
    );
    $rStmt->execute([':pid' => $projectId]);
    $rRows = $rStmt->fetchAll(PDO::FETCH_ASSOC);
    if (is_array($rRows)) {
        foreach ($rRows as $rr) {
            if (!is_array($rr)) {
                continue;
            }
            $rid = isset($rr['redmine_project_id']) ? (int)$rr['redmine_project_id'] : 0;
            if ($rid <= 0) {
                continue;
            }
            $bu = $rr['redmine_base_url'] ?? null;
            $rpn = $rr['redmine_project_name'] ?? null;
            $redmineLinks[] = [
                'redmine_project_id' => $rid,
                'redmine_base_url' => is_string($bu) && $bu !== '' ? $bu : null,
                'redmine_project_name' => is_string($rpn) && $rpn !== '' ? $rpn : null,
            ];
        }
    }

    $miscLinks = [];
    $mStmt = $pdo->prepare(
        'SELECT label, url FROM project_misc_links WHERE project_id = :pid ORDER BY sort_order ASC, id ASC'
    );
    $mStmt->execute([':pid' => $projectId]);
    $mRows = $mStmt->fetchAll(PDO::FETCH_ASSOC);
    if (is_array($mRows)) {
        foreach ($mRows as $mr) {
            if (!is_array($mr)) {
                continue;
            }
            $lb = isset($mr['label']) && is_string($mr['label']) ? $mr['label'] : '';
            $u = isset($mr['url']) && is_string($mr['url']) ? $mr['url'] : '';
            if ($lb === '' || $u === '') {
                continue;
            }
            $miscLinks[] = ['label' => $lb, 'url' => $u];
        }
    }

    $participants = [];
    $pStmt = $pdo->prepare(
        'SELECT pm.user_id, pm.role, u.email, u.display_name AS user_display_name
         FROM project_members pm
         INNER JOIN users u ON u.id = pm.user_id
         WHERE pm.project_id = :pid
         ORDER BY pm.user_id ASC'
    );
    $pStmt->execute([':pid' => $projectId]);
    $pRows = $pStmt->fetchAll(PDO::FETCH_ASSOC);
    if (is_array($pRows)) {
        foreach ($pRows as $pr) {
            if (!is_array($pr)) {
                continue;
            }
            $uid = isset($pr['user_id']) ? (int)$pr['user_id'] : 0;
            if ($uid <= 0) {
                continue;
            }
            $role = isset($pr['role']) && is_string($pr['role']) ? $pr['role'] : 'viewer';
            $rawDn = $pr['user_display_name'] ?? null;
            $dn = is_string($rawDn) ? trim($rawDn) : '';
            /** 閲覧 UI では名前のみ。未設定時は null（メールは出さない） */
            $participants[] = [
                'user_id' => $uid,
                'role' => $role,
                'display_name' => $dn !== '' ? $dn : null,
            ];
        }
    }

    $slug = $row['slug'] ?? null;

    return [
        'id' => $projectId,
        'name' => (string)($row['name'] ?? ''),
        'slug' => is_string($slug) && $slug !== '' ? $slug : null,
        'client_name' => isset($row['client_name']) && is_string($row['client_name']) && $row['client_name'] !== ''
            ? $row['client_name']
            : null,
        'site_type' => isset($row['site_type']) && is_string($row['site_type']) && $row['site_type'] !== ''
            ? $row['site_type']
            : null,
        'site_type_other' => isset($row['site_type_other']) && is_string($row['site_type_other']) && $row['site_type_other'] !== ''
            ? $row['site_type_other']
            : null,
        'project_category' => isset($row['project_category']) && is_string($row['project_category']) && $row['project_category'] !== ''
            ? $row['project_category']
            : ((int)($row['is_renewal'] ?? 0) === 1 ? 'renewal' : 'new'),
        'is_renewal' => (int)($row['is_renewal'] ?? 0) === 1,
        'kickoff_date' => is_string($kick) && $kick !== '' ? $kick : null,
        'release_due_date' => is_string($rel) && $rel !== '' ? $rel : null,
        'is_released' => (int)($row['is_released'] ?? 0) === 1,
        'renewal_urls' => $renewalUrls,
        'redmine_links' => $redmineLinks,
        'misc_links' => $miscLinks,
        'participants' => $participants,
        'effective_role' => is_string($effectiveRole) && $effectiveRole !== '' ? $effectiveRole : null,
    ];
}

/**
 * @return string|null viewer|editor|owner|null if not member
 */
function projectMemberRole(PDO $pdo, int $projectId, int $userId): ?string
{
    $stmt = $pdo->prepare(
        'SELECT role FROM project_members WHERE project_id = :pid AND user_id = :uid LIMIT 1'
    );
    $stmt->execute([':pid' => $projectId, ':uid' => $userId]);
    $r = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($r === false || !is_array($r)) {
        return null;
    }
    $role = $r['role'] ?? '';
    return is_string($role) && $role !== '' ? $role : null;
}

if ($method === 'GET') {
    $pidRaw = $_GET['project_id'] ?? '';
    if (!is_string($pidRaw) || !ctype_digit($pidRaw)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'project_id は正の整数で指定してください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $projectId = (int)$pidRaw;
    if ($projectId <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'project_id は正の整数で指定してください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $role = projectMemberRole($pdo, $projectId, $sessionUserId);
    if ($role === null) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'このプロジェクトへのアクセス権限がありません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $project = buildProjectAggregate($pdo, $projectId, $role);
    if ($project === null) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'プロジェクトが見つかりません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode(['success' => true, 'project' => $project], JSON_UNESCAPED_UNICODE);
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

    $projectId = $payload['project_id'] ?? null;
    if (!is_int($projectId) && !(is_string($projectId) && ctype_digit((string)$projectId))) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'project_id は必須です。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $projectId = (int)$projectId;
    if ($projectId <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'project_id は正の整数にしてください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $memberRole = projectMemberRole($pdo, $projectId, $sessionUserId);
    if ($memberRole === null) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'このプロジェクトへのアクセス権限がありません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($memberRole !== 'owner' && $memberRole !== 'editor') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => '編集権限がありません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (!projectRegistrationUserIdExists($pdo, $sessionUserId)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'ユーザーが見つかりません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $parsed = projectRegistrationParsePayload($payload);
    if (!$parsed['ok']) {
        http_response_code($parsed['status']);
        echo json_encode(['success' => false, 'message' => $parsed['message']], JSON_UNESCAPED_UNICODE);
        exit;
    }

    /** @var array<int,string> $participantMap */
    $participantMap = $parsed['participant_map'];

    $v = projectRegistrationValidateParticipants($pdo, $participantMap, $sessionUserId, true);
    if (!$v['ok']) {
        http_response_code($v['status']);
        echo json_encode(['success' => false, 'message' => $v['message']], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $name = $parsed['name'];
    $clientName = $parsed['client_name'];
    $siteType = $parsed['site_type'];
    $siteTypeOther = $parsed['site_type_other'];
    $isRenewal = $parsed['is_renewal'];
    $projectCategory = $parsed['project_category'];
    $renewalUrls = $parsed['renewal_urls'];
    $kickoffDate = $parsed['kickoff_date'];
    $releaseDueDate = $parsed['release_due_date'];
    $isReleased = $parsed['is_released'];
    $redmineRows = $parsed['redmine_rows'];
    $miscLinks = $parsed['misc_links'];

    $isRenewalInt = $isRenewal ? 1 : 0;
    $isReleasedInt = $isReleased ? 1 : 0;

    try {
        $pdo->beginTransaction();

        $check = $pdo->prepare('SELECT id FROM projects WHERE id = :id FOR UPDATE');
        $check->execute([':id' => $projectId]);
        if ($check->fetch() === false) {
            $pdo->rollBack();
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'プロジェクトが見つかりません。'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $upd = $pdo->prepare(
            'UPDATE projects SET
                name = :name,
                client_name = :client_name,
                site_type = :site_type,
                site_type_other = :site_type_other,
                project_category = :project_category,
                is_renewal = :is_renewal,
                kickoff_date = :kickoff_date,
                release_due_date = :release_due_date,
                is_released = :is_released
             WHERE id = :id'
        );
        $upd->execute([
            ':name' => $name,
            ':client_name' => $clientName,
            ':site_type' => $siteType,
            ':site_type_other' => $siteTypeOther,
            ':project_category' => $projectCategory,
            ':is_renewal' => $isRenewalInt,
            ':kickoff_date' => $kickoffDate,
            ':release_due_date' => $releaseDueDate,
            ':is_released' => $isReleasedInt,
            ':id' => $projectId,
        ]);

        $pdo->prepare('DELETE FROM project_renewal_urls WHERE project_id = :pid')->execute([':pid' => $projectId]);
        $pdo->prepare('DELETE FROM project_redmine_links WHERE project_id = :pid')->execute([':pid' => $projectId]);
        $pdo->prepare('DELETE FROM project_misc_links WHERE project_id = :pid')->execute([':pid' => $projectId]);
        $pdo->prepare('DELETE FROM project_members WHERE project_id = :pid')->execute([':pid' => $projectId]);

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
                'INSERT INTO project_redmine_links (project_id, redmine_project_id, redmine_base_url, redmine_project_name, sort_order)
                 VALUES (:pid, :rid, :base, :rname, :sort_order)'
            );
            foreach ($redmineRows as $rr) {
                $insRm->execute([
                    ':pid' => $projectId,
                    ':rid' => $rr['redmine_project_id'],
                    ':base' => $rr['redmine_base_url'],
                    ':rname' => $rr['redmine_project_name'] ?? null,
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
        foreach ($participantMap as $uid => $role) {
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
        error_log('[platform-common/patch_project] ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'プロジェクトの更新に失敗しました。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $project = buildProjectAggregate($pdo, $projectId, $memberRole);
    if ($project === null) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => '更新後の取得に失敗しました。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode(['success' => true, 'project' => $project], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'DELETE') {
    $pidRaw = $_GET['project_id'] ?? '';
    if (!is_string($pidRaw) || !ctype_digit($pidRaw)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'project_id は正の整数で指定してください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $projectId = (int)$pidRaw;
    if ($projectId <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'project_id は正の整数で指定してください。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $memberRole = projectMemberRole($pdo, $projectId, $sessionUserId);
    if ($memberRole === null) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'このプロジェクトへのアクセス権限がありません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($memberRole !== 'owner') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => '削除できるのはオーナーのみです。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    try {
        $pdo->beginTransaction();

        $check = $pdo->prepare('SELECT id FROM projects WHERE id = :id FOR UPDATE');
        $check->execute([':id' => $projectId]);
        if ($check->fetch() === false) {
            $pdo->rollBack();
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'プロジェクトが見つかりません。'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // 案件に紐づく見積リンク系を先に解除する（見積本体は削除しない）
        $pdo->prepare('UPDATE project_estimates SET project_id = NULL WHERE project_id = :pid')->execute([':pid' => $projectId]);
        $pdo->prepare('DELETE FROM estimate_project_links WHERE project_id = :pid')->execute([':pid' => $projectId]);

        // 案件横断データ（ヒアリング/要件定義）は明示削除
        $pdo->prepare('DELETE FROM project_hearing_sheets WHERE project_id = :pid')->execute([':pid' => $projectId]);
        $pdo->prepare('DELETE FROM project_requirements WHERE project_id = :pid')->execute([':pid' => $projectId]);

        // projects 削除で project_members / misc / redmine / renewal_urls は FK CASCADE で削除
        $pdo->prepare('DELETE FROM projects WHERE id = :id')->execute([':id' => $projectId]);

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[platform-common/delete_project] ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'プロジェクトの削除に失敗しました。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode([
        'success' => true,
        'deleted_project_id' => $projectId,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'GET / PATCH / DELETE メソッドで実行してください。'], JSON_UNESCAPED_UNICODE);
