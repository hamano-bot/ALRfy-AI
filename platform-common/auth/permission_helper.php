<?php
declare(strict_types=1);

/**
 * platform-common の権限判定ヘルパー群
 * - 判定順序: resource_members -> project_members -> no_access
 * - 優先度: owner > editor > viewer
 */

/**
 * ロール文字列を数値優先度へ変換します。
 */
function rolePriority(string $role): int
{
    return match ($role) {
        'owner' => 3,
        'editor' => 2,
        'viewer' => 1,
        default => 0,
    };
}

/**
 * requiredRole を満たすかどうかを返します。
 */
function roleSatisfies(string $actualRole, string $requiredRole): bool
{
    return rolePriority($actualRole) >= rolePriority($requiredRole);
}

/**
 * project_members と resource_members から実効ロールを算出します。
 *
 * @return array{
 *   effective_role: string,
 *   source: string,
 *   candidates: array{project_role: ?string, resource_role: ?string}
 * }
 */
function resolveEffectiveRole(PDO $pdo, int $userId, int $projectId, ?string $resourceType = null, ?int $resourceId = null): array
{
    $projectRole = null;
    $resourceRole = null;

    // プロジェクト所属ロール取得
    try {
        $stmt = $pdo->prepare(
            'SELECT role
             FROM project_members
             WHERE project_id = :project_id AND user_id = :user_id
             LIMIT 1'
        );
        $stmt->execute([
            ':project_id' => $projectId,
            ':user_id' => $userId,
        ]);
        $row = $stmt->fetch();
        if (is_array($row) && isset($row['role']) && is_string($row['role'])) {
            $projectRole = $row['role'];
        }
    } catch (Throwable $e) {
        // まだテーブルが無い初期段階でも API が動くように握りつぶす。
        $projectRole = null;
    }

    // リソース個別付与ロール取得（指定時のみ）
    if ($resourceType !== null && $resourceId !== null) {
        try {
            $stmt = $pdo->prepare(
                'SELECT role
                 FROM resource_members
                 WHERE resource_type = :resource_type
                   AND resource_id = :resource_id
                   AND user_id = :user_id
                 LIMIT 1'
            );
            $stmt->execute([
                ':resource_type' => $resourceType,
                ':resource_id' => $resourceId,
                ':user_id' => $userId,
            ]);
            $row = $stmt->fetch();
            if (is_array($row) && isset($row['role']) && is_string($row['role'])) {
                $resourceRole = $row['role'];
            }
        } catch (Throwable $e) {
            $resourceRole = null;
        }
    }

    $effectiveRole = 'no_access';
    $source = 'none';

    if ($resourceRole !== null && rolePriority($resourceRole) > 0) {
        $effectiveRole = $resourceRole;
        $source = 'resource_members';
    } elseif ($projectRole !== null && rolePriority($projectRole) > 0) {
        $effectiveRole = $projectRole;
        $source = 'project_members';
    }

    return [
        'effective_role' => $effectiveRole,
        'source' => $source,
        'candidates' => [
            'project_role' => $projectRole,
            'resource_role' => $resourceRole,
        ],
    ];
}

/**
 * app_access_policies.required_role とユーザー実効ロールから表示状態を決定します。
 *
 * @param string $forbiddenPolicy 'show_disabled' | 'hide_if_forbidden'
 */
function resolveAppVisibility(string $effectiveRole, string $requiredRole, bool $isActive, string $forbiddenPolicy = 'show_disabled'): string
{
    if (!$isActive) {
        return 'hidden';
    }

    if (roleSatisfies($effectiveRole, $requiredRole)) {
        return 'visible_enabled';
    }

    return $forbiddenPolicy === 'hide_if_forbidden' ? 'hidden' : 'visible_disabled';
}

/**
 * ユーザーが project_members / resource_members のいずれかに所属しているか判定します。
 */
function hasAnyMembership(PDO $pdo, int $userId): bool
{
    // 共有DBに project_members 未作成の段階では、.env.platform-common でスキップ可能
    if (getenv('PLATFORM_COMMON_SKIP_MEMBERSHIP_CHECK') === '1') {
        return true;
    }

    try {
        $projectStmt = $pdo->prepare('SELECT 1 FROM project_members WHERE user_id = :user_id LIMIT 1');
        $projectStmt->execute([':user_id' => $userId]);
        if ($projectStmt->fetch() !== false) {
            return true;
        }
    } catch (Throwable $e) {
        // テーブル未作成などは未所属扱いとして継続。
    }

    try {
        $resourceStmt = $pdo->prepare('SELECT 1 FROM resource_members WHERE user_id = :user_id LIMIT 1');
        $resourceStmt->execute([':user_id' => $userId]);
        return $resourceStmt->fetch() !== false;
    } catch (Throwable $e) {
        return false;
    }
}
