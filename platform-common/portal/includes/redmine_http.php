<?php
declare(strict_types=1);

/**
 * Redmine REST（サーバー側のみで API キーを使用）
 *
 * @return array{ok: bool, http_code: int, data: mixed, raw: string}
 */
function platformRedmineGetJson(string $baseUrl, string $apiKey, string $pathAndQuery): array
{
    $baseUrl = rtrim(trim($baseUrl), '/');
    if ($baseUrl === '' || $apiKey === '') {
        return ['ok' => false, 'http_code' => 0, 'data' => null, 'raw' => ''];
    }
    $url = $baseUrl . $pathAndQuery;
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'http_code' => 0, 'data' => null, 'raw' => 'curl unavailable'];
    }
    $ch = curl_init($url);
    if ($ch === false) {
        return ['ok' => false, 'http_code' => 0, 'data' => null, 'raw' => ''];
    }
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTPHEADER => [
            'X-Redmine-API-Key: ' . $apiKey,
            'Accept: application/json',
        ],
    ]);
    $raw = curl_exec($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if (!is_string($raw)) {
        return ['ok' => false, 'http_code' => $httpCode, 'data' => null, 'raw' => ''];
    }
    $data = json_decode($raw, true);
    return [
        'ok' => $httpCode >= 200 && $httpCode < 300 && is_array($data),
        'http_code' => $httpCode,
        'data' => is_array($data) ? $data : null,
        'raw' => $raw,
    ];
}

/**
 * @return array{projects: array<int, array<string, mixed>>, error: ?string}
 */
function platformRedmineFetchAllProjects(string $baseUrl, string $apiKey, int $maxProjects = 2000): array
{
    $out = [];
    $offset = 0;
    $limit = 100;
    $pages = 0;
    $maxPages = 40;

    while ($pages < $maxPages && count($out) < $maxProjects) {
        $path = '/projects.json?limit=' . $limit . '&offset=' . $offset;
        $res = platformRedmineGetJson($baseUrl, $apiKey, $path);
        if (!$res['ok'] || !is_array($res['data'])) {
            return [
                'projects' => $out,
                'error' => 'Redmine の取得に失敗しました（HTTP ' . $res['http_code'] . '）。',
            ];
        }
        $projects = $res['data']['projects'] ?? null;
        if (!is_array($projects) || $projects === []) {
            break;
        }
        foreach ($projects as $p) {
            if (is_array($p)) {
                $out[] = $p;
            }
        }
        if (count($projects) < $limit) {
            break;
        }
        $offset += $limit;
        $pages++;
    }

    return ['projects' => $out, 'error' => null];
}

/**
 * スペース区切りトークンが name / identifier / description にすべて含まれるか（AND・大小無視）
 *
 * @param array<string, mixed> $project
 * @param list<string> $tokens
 */
function platformRedmineProjectMatchesTokens(array $project, array $tokens): bool
{
    if ($tokens === []) {
        return true;
    }
    $hay = strtolower(
        (string)($project['name'] ?? '') . ' ' .
        (string)($project['identifier'] ?? '') . ' ' .
        (string)($project['description'] ?? '')
    );
    foreach ($tokens as $t) {
        if ($t === '') {
            continue;
        }
        if (!str_contains($hay, strtolower($t))) {
            return false;
        }
    }
    return true;
}

/**
 * プロジェクト配下のチケット一覧（issues.json）
 *
 * @return array{ok: bool, http_code: int, issues: list<array<string,mixed>>, total_count: ?int, error: ?string}
 */
function platformRedmineFetchIssuesForProject(
    string $baseUrl,
    string $apiKey,
    int $redmineNumericProjectId,
    int $limit,
): array {
    if ($redmineNumericProjectId <= 0 || $limit <= 0) {
        return ['ok' => false, 'http_code' => 0, 'issues' => [], 'total_count' => null, 'error' => 'パラメータが不正です。'];
    }
    $q = http_build_query([
        'project_id' => $redmineNumericProjectId,
        'limit' => $limit,
        'sort' => 'updated_on:desc',
    ]);
    $path = '/issues.json?' . $q;
    $res = platformRedmineGetJson($baseUrl, $apiKey, $path);
    if (!$res['ok'] || !is_array($res['data'])) {
        $err = 'Redmine のチケット取得に失敗しました（HTTP ' . $res['http_code'] . '）。';
        return ['ok' => false, 'http_code' => $res['http_code'], 'issues' => [], 'total_count' => null, 'error' => $err];
    }
    $data = $res['data'];
    $issues = $data['issues'] ?? null;
    if (!is_array($issues)) {
        return ['ok' => false, 'http_code' => $res['http_code'], 'issues' => [], 'total_count' => null, 'error' => 'Redmine の応答形式が不正です。'];
    }
    $out = [];
    foreach ($issues as $row) {
        if (is_array($row)) {
            $out[] = $row;
        }
    }
    $total = $data['total_count'] ?? null;
    $totalCount = is_int($total) ? $total : (is_numeric($total) ? (int)$total : null);

    return [
        'ok' => true,
        'http_code' => $res['http_code'],
        'issues' => $out,
        'total_count' => $totalCount,
        'error' => null,
    ];
}
