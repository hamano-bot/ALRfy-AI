<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/auth/permission_helper.php';

/**
 * @return string|false|null
 */
function projectRegistrationParseOptionalDate(mixed $v): string|false|null
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

/**
 * POST / PATCH 共通: 案件登録 JSON を検証し正規化する。
 *
 * @return array{ok:true, name:string, client_name:?string, site_type:?string, site_type_other:?string, is_renewal:bool, renewal_urls:list<array{url:string,sort_order:int}>, kickoff_date:?string, release_due_date:?string, redmine_rows:list<array{redmine_project_id:int,redmine_base_url:?string,redmine_project_name:?string,sort_order:int}>, misc_links:list<array{label:string,url:string,sort_order:int}>, participant_map:array<int,string>}|array{ok:false, status:int, message:string}
 */
function projectRegistrationParsePayload(array $payload): array
{
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
        return ['ok' => false, 'status' => 400, 'message' => 'name は必須で、255 文字以内にしてください。'];
    }

    $clientName = null;
    if (isset($payload['client_name']) && $payload['client_name'] !== null) {
        if (!is_string($payload['client_name'])) {
            return ['ok' => false, 'status' => 400, 'message' => 'client_name は文字列または null にしてください。'];
        }
        $cn = trim($payload['client_name']);
        if ($cn !== '' && mb_strlen($cn) > 255) {
            return ['ok' => false, 'status' => 400, 'message' => 'client_name は 255 文字以内にしてください。'];
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
            return ['ok' => false, 'status' => 400, 'message' => 'site_type が不正です。'];
        }
    }

    $siteTypeOther = null;
    if (isset($payload['site_type_other']) && $payload['site_type_other'] !== null) {
        if (!is_string($payload['site_type_other'])) {
            return ['ok' => false, 'status' => 400, 'message' => 'site_type_other は文字列または null にしてください。'];
        }
        $sto = trim($payload['site_type_other']);
        if ($sto !== '' && mb_strlen($sto) > 255) {
            return ['ok' => false, 'status' => 400, 'message' => 'site_type_other は 255 文字以内にしてください。'];
        }
        $siteTypeOther = $sto === '' ? null : $sto;
    }

    if ($siteType === 'other' && ($siteTypeOther === null || $siteTypeOther === '')) {
        return ['ok' => false, 'status' => 400, 'message' => 'site_type が other のときは site_type_other を入力してください。'];
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
            return ['ok' => false, 'status' => 400, 'message' => 'is_renewal が不正です。'];
        }
    }

    $renewalUrls = [];
    if (isset($payload['renewal_urls'])) {
        if (!is_array($payload['renewal_urls'])) {
            return ['ok' => false, 'status' => 400, 'message' => 'renewal_urls は配列にしてください。'];
        }
        foreach ($payload['renewal_urls'] as $idx => $u) {
            if (!is_string($u)) {
                return ['ok' => false, 'status' => 400, 'message' => 'renewal_urls の各要素は文字列の URL にしてください。'];
            }
            $u = trim($u);
            if ($u === '') {
                continue;
            }
            if (mb_strlen($u) > 2048) {
                return ['ok' => false, 'status' => 400, 'message' => 'renewal_urls の URL が長すぎます。'];
            }
            $renewalUrls[] = ['url' => $u, 'sort_order' => (int)$idx];
        }
    }

    if ($isRenewal === false) {
        $renewalUrls = [];
    }

    $kickoffDate = projectRegistrationParseOptionalDate($payload['kickoff_date'] ?? null);
    if ($kickoffDate === false) {
        return ['ok' => false, 'status' => 400, 'message' => 'kickoff_date は YYYY-MM-DD 形式または null にしてください。'];
    }
    $releaseDueDate = projectRegistrationParseOptionalDate($payload['release_due_date'] ?? null);
    if ($releaseDueDate === false) {
        return ['ok' => false, 'status' => 400, 'message' => 'release_due_date は YYYY-MM-DD 形式または null にしてください。'];
    }

    $redmineRows = [];
    if (isset($payload['redmine_links'])) {
        if (!is_array($payload['redmine_links'])) {
            return ['ok' => false, 'status' => 400, 'message' => 'redmine_links は配列にしてください。'];
        }
        $seen = [];
        foreach ($payload['redmine_links'] as $idx => $item) {
            $rid = null;
            $baseUrl = null;
            $redmineProjectName = null;
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
                        return ['ok' => false, 'status' => 400, 'message' => 'redmine_base_url は文字列または null にしてください。'];
                    }
                    $bu = trim($item['redmine_base_url']);
                    if ($bu !== '') {
                        if (mb_strlen($bu) > 512) {
                            return ['ok' => false, 'status' => 400, 'message' => 'redmine_base_url が長すぎます。'];
                        }
                        $baseUrl = $bu;
                    }
                }
                if (isset($item['redmine_project_name']) && $item['redmine_project_name'] !== null) {
                    if (!is_string($item['redmine_project_name'])) {
                        return ['ok' => false, 'status' => 400, 'message' => 'redmine_project_name は文字列または null にしてください。'];
                    }
                    $pn = trim($item['redmine_project_name']);
                    if ($pn !== '') {
                        if (mb_strlen($pn) > 255) {
                            return ['ok' => false, 'status' => 400, 'message' => 'redmine_project_name が長すぎます。'];
                        }
                        $redmineProjectName = $pn;
                    }
                }
            } else {
                return ['ok' => false, 'status' => 400, 'message' => 'redmine_links の要素が不正です。'];
            }
            if ($rid === null || $rid <= 0) {
                return ['ok' => false, 'status' => 400, 'message' => 'redmine_project_id は正の整数にしてください。'];
            }
            $key = (string)$rid;
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $redmineRows[] = [
                'redmine_project_id' => $rid,
                'redmine_base_url' => $baseUrl,
                'redmine_project_name' => $redmineProjectName,
                'sort_order' => (int)$idx,
            ];
        }
    }

    $miscLinks = [];
    if (isset($payload['misc_links'])) {
        if (!is_array($payload['misc_links'])) {
            return ['ok' => false, 'status' => 400, 'message' => 'misc_links は配列にしてください。'];
        }
        foreach ($payload['misc_links'] as $idx => $row) {
            if (!is_array($row)) {
                return ['ok' => false, 'status' => 400, 'message' => 'misc_links の各要素はオブジェクトにしてください。'];
            }
            $label = isset($row['label']) && is_string($row['label']) ? trim($row['label']) : '';
            $url = isset($row['url']) && is_string($row['url']) ? trim($row['url']) : '';
            if ($label === '' || $url === '') {
                continue;
            }
            if (mb_strlen($label) > 255) {
                return ['ok' => false, 'status' => 400, 'message' => 'misc_links の label が長すぎます。'];
            }
            if (mb_strlen($url) > 2048) {
                return ['ok' => false, 'status' => 400, 'message' => 'misc_links の url が長すぎます。'];
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
            return ['ok' => false, 'status' => 400, 'message' => 'participants は配列にしてください。'];
        }
        foreach ($payload['participants'] as $row) {
            if (!is_array($row)) {
                return ['ok' => false, 'status' => 400, 'message' => 'participants の各要素はオブジェクトにしてください。'];
            }
            $uid = $row['user_id'] ?? null;
            if (!is_int($uid) && !(is_string($uid) && ctype_digit($uid))) {
                return ['ok' => false, 'status' => 400, 'message' => 'participants.user_id が不正です。'];
            }
            $uid = (int)$uid;
            if ($uid <= 0) {
                return ['ok' => false, 'status' => 400, 'message' => 'participants.user_id は正の整数にしてください。'];
            }
            $role = $row['role'] ?? '';
            if ($role !== 'editor' && $role !== 'viewer' && $role !== 'owner') {
                return ['ok' => false, 'status' => 400, 'message' => 'participants.role は owner / editor / viewer にしてください。'];
            }
            if (!isset($participantMap[$uid]) || rolePriority($role) > rolePriority($participantMap[$uid])) {
                $participantMap[$uid] = $role;
            }
        }
    }

    return [
        'ok' => true,
        'name' => $name,
        'client_name' => $clientName,
        'site_type' => $siteType,
        'site_type_other' => $siteTypeOther,
        'is_renewal' => $isRenewal,
        'renewal_urls' => $renewalUrls,
        'kickoff_date' => $kickoffDate,
        'release_due_date' => $releaseDueDate,
        'redmine_rows' => $redmineRows,
        'misc_links' => $miscLinks,
        'participant_map' => $participantMap,
    ];
}

function projectRegistrationUserIdExists(PDO $pdo, int $userId): bool
{
    $stmt = $pdo->prepare('SELECT 1 FROM users WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $userId]);
    return $stmt->fetch() !== false;
}

/**
 * @param array<int,string> $participantMap
 * @return array{ok:true}|array{ok:false, status:int, message:string}
 */
function projectRegistrationValidateParticipants(
    PDO $pdo,
    array $participantMap,
    int $sessionUserId,
    bool $requireSessionUserInList,
): array {
    foreach (array_keys($participantMap) as $pid) {
        if (!projectRegistrationUserIdExists($pdo, $pid)) {
            return ['ok' => false, 'status' => 400, 'message' => '存在しない user_id が participants に含まれています。'];
        }
    }

    $ownerCount = 0;
    foreach ($participantMap as $role) {
        if ($role === 'owner') {
            $ownerCount++;
        }
    }
    if ($ownerCount < 1) {
        return ['ok' => false, 'status' => 400, 'message' => 'オーナーは少なくとも1名必要です。'];
    }

    if ($requireSessionUserInList && !isset($participantMap[$sessionUserId])) {
        return ['ok' => false, 'status' => 400, 'message' => '更新者を参加者（オーナー・編集・参照のいずれか）に含めてください。'];
    }

    return ['ok' => true];
}
