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

/**
 * Redmine REST POST（JSON ボディ）
 *
 * @param array<string, mixed> $body Encoded as JSON
 * @return array{ok: bool, http_code: int, data: mixed, raw: string}
 */
function platformRedminePostJson(string $baseUrl, string $apiKey, string $path, array $body): array
{
    $baseUrl = rtrim(trim($baseUrl), '/');
    if ($baseUrl === '' || $apiKey === '') {
        return ['ok' => false, 'http_code' => 0, 'data' => null, 'raw' => ''];
    }
    $url = $baseUrl . $path;
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'http_code' => 0, 'data' => null, 'raw' => 'curl unavailable'];
    }
    $payload = json_encode($body, JSON_UNESCAPED_UNICODE);
    if ($payload === false) {
        return ['ok' => false, 'http_code' => 0, 'data' => null, 'raw' => ''];
    }
    $ch = curl_init($url);
    if ($ch === false) {
        return ['ok' => false, 'http_code' => 0, 'data' => null, 'raw' => ''];
    }
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTPHEADER => [
            'X-Redmine-API-Key: ' . $apiKey,
            'Content-Type: application/json',
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
 * チケット作成 POST /issues.json
 *
 * @param array<string, mixed> $issueFields issue オブジェクトの中身（project_id, subject, description 等）
 * @return array{ok: bool, http_code: int, issue: ?array<string, mixed>, error: ?string}
 */
function platformRedmineCreateIssue(string $baseUrl, string $apiKey, array $issueFields): array
{
    if ($baseUrl === '' || $apiKey === '') {
        return ['ok' => false, 'http_code' => 0, 'issue' => null, 'error' => 'Redmine の設定が不正です。'];
    }
    $res = platformRedminePostJson($baseUrl, $apiKey, '/issues.json', ['issue' => $issueFields]);
    if (!$res['ok'] || !is_array($res['data'])) {
        $err = 'Redmine へのチケット作成に失敗しました（HTTP ' . $res['http_code'] . '）。';
        $details = null;
        if (is_array($res['data'])) {
            $errors = $res['data']['errors'] ?? null;
            if (is_array($errors)) {
                $messages = [];
                foreach ($errors as $e) {
                    if (is_string($e)) {
                        $t = trim($e);
                        if ($t !== '') {
                            $messages[] = $t;
                        }
                    }
                }
                if ($messages !== []) {
                    $details = implode(' / ', $messages);
                }
            }
            if ($details === null && isset($res['data']['error']) && is_string($res['data']['error'])) {
                $t = trim($res['data']['error']);
                if ($t !== '') {
                    $details = $t;
                }
            }
        }
        if ($details === null) {
            $raw = trim((string)($res['raw'] ?? ''));
            if ($raw !== '' && $raw !== '[]' && $raw !== '{}') {
                $details = mb_substr($raw, 0, 300);
            }
        }
        if ($details !== null) {
            $err .= ' 理由: ' . $details;
        }
        return ['ok' => false, 'http_code' => $res['http_code'], 'issue' => null, 'error' => $err];
    }
    $issue = $res['data']['issue'] ?? null;
    if (!is_array($issue)) {
        return ['ok' => false, 'http_code' => $res['http_code'], 'issue' => null, 'error' => 'Redmine の応答形式が不正です。'];
    }
    return ['ok' => true, 'http_code' => $res['http_code'], 'issue' => $issue, 'error' => null];
}

/**
 * API キーに紐づく Redmine ユーザー ID（GET /users/current.json）
 *
 * @return int 取得できない場合は 0
 */
function platformRedmineGetCurrentUserId(string $baseUrl, string $apiKey): int
{
    if (rtrim(trim($baseUrl), '/') === '' || $apiKey === '') {
        return 0;
    }
    $res = platformRedmineGetJson($baseUrl, $apiKey, '/users/current.json');
    if (!$res['ok'] || !is_array($res['data'])) {
        return 0;
    }
    $user = $res['data']['user'] ?? null;
    if (!is_array($user)) {
        return 0;
    }
    $id = $user['id'] ?? null;
    if (is_int($id) && $id > 0) {
        return $id;
    }
    if (is_numeric($id)) {
        $n = (int)$id;

        return $n > 0 ? $n : 0;
    }

    return 0;
}
