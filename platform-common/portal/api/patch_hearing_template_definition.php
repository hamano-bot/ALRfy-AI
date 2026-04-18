<?php
declare(strict_types=1);

/**
 * PATCH /portal/api/hearing-template-definition — cron がテンプレ定義を更新し system_update_events に記録。
 */

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__) . '/includes/project_registration_schema.php';
require_once dirname(__DIR__) . '/includes/hearing_insight_schema.php';
require_once dirname(__DIR__) . '/includes/hearing_insight_cron_auth.php';

header('Content-Type: application/json; charset=UTF-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'PATCH') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'PATCH のみです。'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!hearingInsightCronAuthOk()) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => '認可に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw = file_get_contents('php://input');
$data = is_string($raw) ? json_decode($raw, true) : null;
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'JSON ボディが不正です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$templateId = isset($data['template_id']) && is_string($data['template_id']) ? trim($data['template_id']) : '';
$expectedVersion = isset($data['expected_version']) && is_int($data['expected_version']) ? $data['expected_version'] : null;
if ($expectedVersion === null && isset($data['expected_version']) && is_numeric($data['expected_version'])) {
    $expectedVersion = (int) $data['expected_version'];
}
$itemsPayload = $data['body_json'] ?? null;
if ($templateId === '' || $expectedVersion === null || !is_array($itemsPayload)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'template_id, expected_version, body_json が必要です。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = createPdoFromApplicationEnv();
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'データベース接続に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    ensureProjectRegistrationSchema($pdo);
    ensureHearingInsightSchema($pdo);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'スキーマを確認してください。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$pdo->beginTransaction();
try {
    $sel = $pdo->prepare(
        'SELECT `version`, `items_json` FROM `hearing_template_definitions` WHERE `template_id` = :tid FOR UPDATE'
    );
    $sel->execute([':tid' => $templateId]);
    $cur = $sel->fetch(PDO::FETCH_ASSOC);
    if ($cur === false || !is_array($cur)) {
        $pdo->rollBack();
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'テンプレ定義がありません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $ver = (int) $cur['version'];
    if ($ver !== $expectedVersion) {
        $pdo->rollBack();
        http_response_code(409);
        echo json_encode(
            [
                'success' => false,
                'message' => 'バージョンが一致しません。',
                'current_version' => $ver,
            ],
            JSON_UNESCAPED_UNICODE
        );
        exit;
    }

    $nextVer = $ver + 1;
    $encoded = json_encode($itemsPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        $pdo->rollBack();
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'body_json を JSON にできません。'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $upd = $pdo->prepare(
        'UPDATE `hearing_template_definitions` SET `version` = :nv, `items_json` = :js WHERE `template_id` = :tid'
    );
    $upd->execute([':nv' => $nextVer, ':js' => $encoded, ':tid' => $templateId]);

    $prevJson = (string) ($cur['items_json'] ?? '');
    $prevDec = json_decode($prevJson, true);
    $prevN = is_array($prevDec) && isset($prevDec['items']) && is_array($prevDec['items']) ? count($prevDec['items']) : 0;
    $nextDec = json_decode($encoded, true);
    $nextN = is_array($nextDec) && isset($nextDec['items']) && is_array($nextDec['items']) ? count($nextDec['items']) : 0;

    $detail = [
        'previous_item_count' => $prevN,
        'next_item_count' => $nextN,
        'template_id' => $templateId,
    ];
    $detailJson = json_encode($detail, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    $title = 'ヒアリングテンプレ更新: ' . $templateId;
    $insEv = $pdo->prepare(
        'INSERT INTO `system_update_events` (
          `kind`, `title`, `template_id`, `template_version_before`, `template_version_after`, `detail_json`, `summary`
        ) VALUES (
          \'template\', :title, :tid, :vb, :va, :dj, :sm
        )'
    );
    $insEv->execute([
        ':title' => $title,
        ':tid' => $templateId,
        ':vb' => $ver,
        ':va' => $nextVer,
        ':dj' => $detailJson !== false ? $detailJson : '{}',
        ':sm' => 'template_id=' . $templateId . ' を v' . $ver . '→v' . $nextVer . ' に更新しました。',
    ]);

    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    error_log('[patch_hearing_template_definition] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '更新に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode(
    [
        'success' => true,
        'template_id' => $templateId,
        'version' => $nextVer,
    ],
    JSON_UNESCAPED_UNICODE
);
