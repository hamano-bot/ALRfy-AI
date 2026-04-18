<?php
declare(strict_types=1);

/**
 * 案件マスタの site_type / is_renewal から template_id を決定（project-manager の resolveHearingTemplateId と同等）。
 *
 * @return non-empty-string
 */
function hearingInsightResolveTemplateId(?string $siteType, bool $isRenewal): string
{
    $st = $siteType ?? '';
    if ($st === 'corporate') {
        return $isRenewal ? 'corporate_renewal' : 'corporate_new';
    }
    if ($st === 'ec') {
        return $isRenewal ? 'ec_renewal' : 'ec_new';
    }

    return $isRenewal ? 'generic_renewal' : 'generic_new';
}

/**
 * クライアント環境に閉じた行をテンプレ学習から除外（ルールベース）。
 */
function hearingAnalyticsIsClientSpecificRow(string $category, string $heading, string $question): bool
{
    $c = trim($category);
    if (str_starts_with($c, '[クライアント専用]') || str_starts_with($c, '【クライアント専用】')) {
        return true;
    }
    if (str_contains($c, 'クライアント環境専用')) {
        return true;
    }
    $h = trim($heading);
    if (str_starts_with($h, '[クライアント専用]')) {
        return true;
    }

    return false;
}

/**
 * PATCH 後の body_json から解析行を再構築（プロジェクト単位で全置換）。
 */
function hearingAnalyticsIngestFromBody(PDO $pdo, int $projectId, array $bodyJson): void
{
    $stmt = $pdo->prepare(
        'SELECT `site_type`, `is_renewal` FROM `projects` WHERE `id` = :id LIMIT 1'
    );
    $stmt->execute([':id' => $projectId]);
    $proj = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($proj === false || !is_array($proj)) {
        return;
    }

    $siteType = isset($proj['site_type']) && is_string($proj['site_type']) ? $proj['site_type'] : null;
    $isRenewal = isset($proj['is_renewal']) && (int) $proj['is_renewal'] === 1;

    $resolved = hearingInsightResolveTemplateId($siteType, $isRenewal);
    $bodyTemplateId = isset($bodyJson['template_id']) && is_string($bodyJson['template_id'])
        ? $bodyJson['template_id']
        : '';
    $profileMatch = $bodyTemplateId !== '' && $bodyTemplateId === $resolved;

    $items = $bodyJson['items'] ?? null;
    if (!is_array($items)) {
        $items = [];
    }

    $del = $pdo->prepare('DELETE FROM `hearing_analytics_items` WHERE `project_id` = :pid');
    $del->execute([':pid' => $projectId]);

    $ins = $pdo->prepare(
        'INSERT INTO `hearing_analytics_items` (
          `project_id`, `item_id`, `resolved_template_id`, `body_template_id`,
          `category`, `heading`, `question`, `excluded_reason`
        ) VALUES (
          :pid, :iid, :rtid, :btid, :cat, :hd, :q, :ex
        )'
    );

    foreach ($items as $idx => $it) {
        if (!is_array($it)) {
            continue;
        }
        $itemId = isset($it['id']) && is_string($it['id']) && $it['id'] !== ''
            ? $it['id']
            : 'row-' . (string) $idx;
        $category = isset($it['category']) && is_string($it['category']) ? $it['category'] : '';
        $heading = isset($it['heading']) && is_string($it['heading']) ? $it['heading'] : '';
        $question = isset($it['question']) && is_string($it['question']) ? $it['question'] : '';

        $excluded = null;
        if (!$profileMatch) {
            $excluded = 'profile_mismatch';
        } elseif (hearingAnalyticsIsClientSpecificRow($category, $heading, $question)) {
            $excluded = 'client_specific';
        }

        $ins->execute([
            ':pid' => $projectId,
            ':iid' => $itemId,
            ':rtid' => $resolved,
            ':btid' => $bodyTemplateId !== '' ? $bodyTemplateId : null,
            ':cat' => $category,
            ':hd' => $heading,
            ':q' => $question,
            ':ex' => $excluded,
        ]);
    }
}
