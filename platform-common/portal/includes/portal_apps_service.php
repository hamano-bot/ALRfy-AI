<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/auth/permission_helper.php';

/**
 * DB の `apps.route` を、環境ごとの公開 URL で上書きする。
 * 未設定のときは DB の値をそのまま使う。
 */
function portalResolveAppRoute(string $appKey, string $dbRoute): string
{
    if ($appKey === 'minutes-record') {
        $override = getenv('MINUTES_RECORD_PORTAL_URL');
        if (is_string($override) && $override !== '') {
            return $override;
        }
    }

    if ($appKey === 'project-manager') {
        $override = getenv('PROJECT_MANAGER_PORTAL_URL');
        if (is_string($override) && $override !== '') {
            return $override;
        }
        // 案件管理アプリの公開パスは `/project-manager`。旧シードの `/projects` は 404 になるため寄せる。
        if ($dbRoute === '/projects' || $dbRoute === '') {
            return '/project-manager';
        }
        if (str_starts_with($dbRoute, '/project-manager')) {
            return $dbRoute;
        }
        return '/project-manager' . $dbRoute;
    }

    return $dbRoute;
}

/**
 * ログインユーザー向けにポータル表示用アプリ一覧を組み立てる（GET /apps と同一ロジック）。
 *
 * @return array{
 *   success: bool,
 *   apps?: list<array{app_key: string, title: string, route: string, required_role: string, visibility: string, reason: ?string}>,
 *   effective_role?: string,
 *   error_code?: string,
 *   message?: string
 * }
 */
function portalFetchAppsForUser(PDO $pdo, int $userId): array
{
    if (!hasAnyMembership($pdo, $userId)) {
        return [
            'success' => false,
            'error_code' => 'unassigned_user',
            'message' => '所属先が未設定のため利用できません。',
        ];
    }

    $effectiveRole = 'no_access';
    try {
        $roleStmt = $pdo->prepare('SELECT role FROM project_members WHERE user_id = :user_id');
        $roleStmt->execute([':user_id' => $userId]);
        $rows = $roleStmt->fetchAll();
        if (is_array($rows)) {
            foreach ($rows as $row) {
                if (!is_array($row) || !isset($row['role']) || !is_string($row['role'])) {
                    continue;
                }
                if (rolePriority($row['role']) > rolePriority($effectiveRole)) {
                    $effectiveRole = $row['role'];
                }
            }
        }
    } catch (Throwable $e) {
        // project_members 未作成時は no_access のまま評価する。
    }

    $forbiddenPolicy = 'show_disabled';

    $sql = <<<'SQL'
SELECT a.app_key, a.name, a.route, a.is_active, a.display_order,
       ap.required_role
FROM apps a
LEFT JOIN app_access_policies ap ON ap.app_id = a.id AND ap.is_enabled = 1
ORDER BY a.display_order ASC, a.id ASC
SQL;
    $stmt = $pdo->query($sql);
    $rows = $stmt->fetchAll();

    $apps = [];
    if (is_array($rows)) {
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $requiredRole = isset($row['required_role']) && is_string($row['required_role']) && $row['required_role'] !== ''
                ? $row['required_role']
                : 'viewer';
            $isActive = (int)($row['is_active'] ?? 0) === 1;

            $visibility = resolveAppVisibility($effectiveRole, $requiredRole, $isActive, $forbiddenPolicy);
            if ($visibility === 'hidden') {
                continue;
            }

            $appKey = (string)($row['app_key'] ?? '');
            $apps[] = [
                'app_key' => $appKey,
                'title' => (string)($row['name'] ?? ''),
                'route' => portalResolveAppRoute($appKey, (string)($row['route'] ?? '')),
                'required_role' => $requiredRole,
                'visibility' => $visibility,
                'reason' => $visibility === 'visible_disabled' ? 'insufficient_role' : null,
            ];
        }
    }

    return [
        'success' => true,
        'effective_role' => $effectiveRole,
        'apps' => $apps,
    ];
}
