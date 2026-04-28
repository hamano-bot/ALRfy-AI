<?php
declare(strict_types=1);

/** 明細の大項目行（EstimateEditorClient と同一コード） */
const ESTIMATE_MAJOR_LINE_ITEM_CODE = '__ESTIMATE_MAJOR__';
/** 明細の空白行（EstimateEditorClient と同一コード） */
const ESTIMATE_BLANK_DETAIL_LINE_ITEM_CODE = '__ESTIMATE_BLANK_DETAIL__';

require_once dirname(__DIR__, 2) . '/auth/bootstrap.php';
require_once dirname(__DIR__) . '/includes/estimate_schema.php';

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

try {
    $pdo = createPdoFromApplicationEnv();
    ensureEstimateSchema($pdo);
} catch (Throwable $e) {
    error_log('[estimate_export_html schema] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '初期化に失敗しました。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw = file_get_contents('php://input');
$payload = json_decode($raw !== false ? $raw : '', true);
if (!is_array($payload) || !isset($payload['estimate_id']) || !is_numeric($payload['estimate_id'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'estimate_id は必須です。'], JSON_UNESCAPED_UNICODE);
    exit;
}
$estimateId = (int)$payload['estimate_id'];

/**
 * @param float|int|string|null $n
 */
function estimateFormatYen($n): string
{
    $v = is_numeric($n) ? (float)$n : 0.0;
    return '¥' . number_format((int)round($v), 0, '', ',');
}

/**
 * @param float|int|string|null $n
 */
function estimateFormatQty($n): string
{
    if (!is_numeric($n)) {
        return '';
    }
    $v = (float)$n;
    if (abs($v - round($v)) < 1e-9) {
        return (string)(int)round($v);
    }
    return rtrim(rtrim(number_format($v, 4, '.', ''), '0'), '.');
}

function estimateUnitLabelJp(?string $unitType): string
{
    $u = $unitType !== null ? trim($unitType) : '';
    return match ($u) {
        'person_month' => '人月',
        'person_day' => '人日',
        'set' => '式',
        'page' => 'ページ',
        'times' => '回',
        'percent' => '%',
        'monthly_fee' => '月額',
        'annual_fee' => '年額',
        default => $u !== '' ? $u : '式',
    };
}

function estimateFormatIssueDate(?string $ymd): string
{
    if ($ymd === null || $ymd === '') {
        return '';
    }
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $ymd, $m) === 1) {
        return $m[1] . '/' . $m[2] . '/' . $m[3];
    }
    return $ymd;
}

/**
 * @param array<int, array<string, mixed>> $lines
 * @return array<int, array{heading: string, rows: list<array<string, mixed>>}>
 */
function estimateGroupLinesForExport(array $lines): array
{
    $blocks = [];

    foreach ($lines as $line) {
        if (!is_array($line)) {
            continue;
        }
        $code = isset($line['item_code']) && is_string($line['item_code']) ? trim($line['item_code']) : '';
        if ($code === ESTIMATE_MAJOR_LINE_ITEM_CODE) {
            $title = isset($line['item_name']) && is_string($line['item_name']) ? trim($line['item_name']) : '';
            if ($title === '') {
                $mc = isset($line['major_category']) && is_string($line['major_category']) ? trim($line['major_category']) : '';
                $title = $mc !== '' ? $mc : '大項目';
            }
            $blocks[] = ['heading' => $title, 'rows' => []];
            continue;
        }
        if ($blocks === []) {
            $blocks[] = ['heading' => '', 'rows' => []];
        }
        $blocks[count($blocks) - 1]['rows'][] = $line;
    }

    if ($blocks === []) {
        $blocks[] = ['heading' => '', 'rows' => []];
    }

    return $blocks;
}

/**
 * @param list<array<string, mixed>> $rows
 */
function estimateBlockSubtotal(array $rows): float
{
    $s = 0.0;
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $amt = $row['line_amount'] ?? 0;
        $s += is_numeric($amt) ? (float)$amt : 0.0;
    }
    return $s;
}

/**
 * @param list<string> $lines
 */
function estimateRemarksStripMojibake(string $s): string
{
    $s = str_replace("\xEF\xBB\xBF", '', $s);
    if (function_exists('iconv')) {
        $conv = @iconv('UTF-8', 'UTF-8//IGNORE', $s);
        if ($conv !== false) {
            $s = $conv;
        }
    }
    $s = preg_replace('/\x{FFFD}/u', '', $s) ?? $s;

    return $s;
}

function estimateRemarksListHtml(string $remarksRaw): string
{
    $t = trim(estimateRemarksStripMojibake($remarksRaw));
    if ($t === '') {
        return '<p class="est-remarks-empty">—</p>';
    }
    $parts = preg_split("/\r\n|\n|\r/", $t) ?: [];
    $items = [];
    foreach ($parts as $p) {
        $line = trim(estimateRemarksStripMojibake((string)$p));
        if ($line === '') {
            continue;
        }
        // 先頭の箇条記号は「文字単位」で落とす（「・」は UTF-8 で3バイトのため substr(2) だと壊れて 化する）
        if (str_starts_with($line, '- ')) {
            $line = trim(mb_substr($line, 2, null, 'UTF-8'));
        } elseif (str_starts_with($line, '・')) {
            $line = trim(mb_substr($line, 1, null, 'UTF-8'));
        } elseif (str_starts_with($line, "\u{2022}") || str_starts_with($line, "\u{2023}")) {
            $line = trim(mb_substr($line, 1, null, 'UTF-8'));
        } elseif (str_starts_with($line, '-')) {
            $line = trim(mb_substr($line, 1, null, 'UTF-8'));
        }
        $items[] = '<li>' . htmlspecialchars($line, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</li>';
    }
    if ($items === []) {
        return '<ul class="est-remarks-ul"><li>' . htmlspecialchars($t, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</li></ul>';
    }

    return '<ul class="est-remarks-ul">' . implode('', $items) . '</ul>';
}

$salesJoinSql = 'SELECT pe.*, NULL AS sales_user_label FROM project_estimates pe WHERE pe.id = :id LIMIT 1';
try {
    $salesJoinSql = 'SELECT pe.*, COALESCE(NULLIF(TRIM(u.display_name), \'\'), u.email, \'\') AS sales_user_label
         FROM project_estimates pe
         LEFT JOIN users u ON u.id = pe.sales_user_id
         WHERE pe.id = :id LIMIT 1';
    $stmt = $pdo->prepare($salesJoinSql);
    $stmt->execute([':id' => $estimateId]);
    $estimate = $stmt->fetch(PDO::FETCH_ASSOC);
} catch (Throwable $e) {
    $stmt = $pdo->prepare('SELECT pe.*, NULL AS sales_user_label FROM project_estimates pe WHERE pe.id = :id LIMIT 1');
    $stmt->execute([':id' => $estimateId]);
    $estimate = $stmt->fetch(PDO::FETCH_ASSOC);
}

if (!is_array($estimate)) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => '見積が見つかりません。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$lineStmt = $pdo->prepare(
    'SELECT item_code, major_category, category, item_name, quantity, unit_type, unit_price, line_amount, factor, sort_order
     FROM project_estimate_lines
     WHERE estimate_id = :id
     ORDER BY sort_order ASC, id ASC'
);
$lineStmt->execute([':id' => $estimateId]);
$lines = $lineStmt->fetchAll(PDO::FETCH_ASSOC);
if (!is_array($lines)) {
    $lines = [];
}

$blocks = estimateGroupLinesForExport($lines);
$rowCountForWarning = 0;
foreach ($blocks as $b) {
    $rowCountForWarning += 1 + count($b['rows']) + 1;
}
/** しきい値は project-manager の `ESTIMATE_A4_HTML_EXPORT_ROW_BUDGET` と同期 */
$estimateA4HtmlExportRowBudget = 22;
$isOverflowWarning = $rowCountForWarning > $estimateA4HtmlExportRowBudget;
/**
 * 少行時のみ明細領域を縦に育てる（行高 + 補完空行）。
 * 行換算は warning と同一（見出し1 + 明細 + 小計1）。
 */
$estimateSparseDetailRowThreshold = 10;
$isSparseDetailLayout = $rowCountForWarning <= $estimateSparseDetailRowThreshold;
/** 少行時に目標とする見た目行数（行換算ベース） */
$estimateSparseDetailTargetVisualRows = 16;
$estimateSparseFillRows = $isSparseDetailLayout
    ? max(0, $estimateSparseDetailTargetVisualRows - $rowCountForWarning)
    : 0;

$docTitle = ((int)($estimate['is_rough_estimate'] ?? 0) === 1) ? '概算御見積書' : '御見積書';
$subjectTitle = isset($estimate['title']) && is_string($estimate['title']) ? trim($estimate['title']) : '';
$clientName = isset($estimate['client_name']) && is_string($estimate['client_name']) ? trim($estimate['client_name']) : '';
$recipient = (string)($estimate['recipient_text'] ?? '');
$issueDate = estimateFormatIssueDate(isset($estimate['issue_date']) && is_string($estimate['issue_date']) ? $estimate['issue_date'] : null);
$estimateNumberRaw = (string)($estimate['estimate_number'] ?? '');
$estimateNumberStripped = preg_replace('/^見積_/u', '', $estimateNumberRaw) ?? $estimateNumberRaw;
$clientAbbrForDisplay = isset($estimate['client_abbr']) && is_string($estimate['client_abbr']) ? trim($estimate['client_abbr']) : '';
$estimateNumberDisplay = $estimateNumberStripped;
if ($clientAbbrForDisplay !== '' && preg_match('/^(\d{8})_[^_]+_(\d{4})$/u', $estimateNumberStripped, $qn) === 1) {
    $estimateNumberDisplay = $qn[1] . '_' . $clientAbbrForDisplay . '_' . $qn[2];
} elseif (preg_match('/^(.+)_(\d{4})$/u', $estimateNumberStripped, $pn) === 1 && preg_match('/^\d{8}_/u', $estimateNumberStripped) !== 1) {
    $issueYmd = '';
    if (isset($estimate['issue_date']) && is_string($estimate['issue_date']) && preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $estimate['issue_date'], $im) === 1) {
        $issueYmd = $im[1] . $im[2] . $im[3];
    }
    $mid = $clientAbbrForDisplay !== '' ? $clientAbbrForDisplay : 'CLIENT';
    if ($issueYmd !== '' && preg_match('/^\d{8}$/', $issueYmd) === 1) {
        $estimateNumberDisplay = $issueYmd . '_' . $mid . '_' . $pn[2];
    }
}
$estimateNumber = htmlspecialchars($estimateNumberDisplay, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$deliveryDueRaw = isset($estimate['delivery_due_text']) && is_string($estimate['delivery_due_text']) ? trim($estimate['delivery_due_text']) : '';
if ($deliveryDueRaw !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $deliveryDueRaw) === 1) {
    $deliveryDueDisplay = estimateFormatIssueDate($deliveryDueRaw);
} else {
    $deliveryDueDisplay = $deliveryDueRaw !== '' ? $deliveryDueRaw : '—';
}
$deliveryDueEsc = htmlspecialchars($deliveryDueDisplay, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

$taxPercent = $estimate['applied_tax_rate_percent'] ?? 10;
if (!is_numeric($taxPercent)) {
    $taxPercent = 10.0;
}
$taxPercentStr = rtrim(rtrim(number_format((float)$taxPercent, 2, '.', ''), '0'), '.');

$salesLabel = '';
if (isset($estimate['sales_user_label']) && is_string($estimate['sales_user_label'])) {
    $salesLabel = trim($estimate['sales_user_label']);
}
$salesEsc = htmlspecialchars($salesLabel !== '' ? $salesLabel : '—', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

$subtotal = estimateFormatYen($estimate['subtotal_excluding_tax'] ?? 0);
$taxAmt = estimateFormatYen($estimate['tax_amount'] ?? 0);
$totalIncl = estimateFormatYen($estimate['total_including_tax'] ?? 0);

$issuerName = getenv('ESTIMATE_ISSUER_COMPANY_NAME') ?: '';
$issuerAddr = getenv('ESTIMATE_ISSUER_ADDRESS') ?: '';
$issuerTel = getenv('ESTIMATE_ISSUER_TEL') ?: '';
$issuerFax = getenv('ESTIMATE_ISSUER_FAX') ?: '';
$issuerUrl = getenv('ESTIMATE_ISSUER_URL') ?: '';
if ($issuerName === '') {
    $issuerName = '株式会社シフト';
}
if ($issuerAddr === '') {
    $issuerAddr = "〒103-0012　東京都中央区日本橋堀留町2-9-8\n         Daiwa日本橋堀留町ビル２F";
}
if ($issuerTel === '') {
    $issuerTel = '03-5847-1281';
}
if ($issuerFax === '') {
    $issuerFax = '03-5847-1282';
}
if ($issuerUrl === '') {
    $issuerUrl = 'http://www.shift-jp.net';
}

$issuerNameEsc = htmlspecialchars($issuerName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$issuerAddrHtml = nl2br(htmlspecialchars(str_replace(["\r\n", "\r"], "\n", $issuerAddr), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'));
$issuerTelEsc = htmlspecialchars($issuerTel, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$issuerFaxEsc = htmlspecialchars($issuerFax, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$issuerUrlEsc = htmlspecialchars($issuerUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

$remarksRaw = isset($estimate['remarks']) ? trim((string)$estimate['remarks']) : '';
$remarksHtml = estimateRemarksListHtml($remarksRaw);

$tbodyHtml = '';
foreach ($blocks as $block) {
    $heading = isset($block['heading']) && is_string($block['heading']) ? trim($block['heading']) : '';
    $rows = isset($block['rows']) && is_array($block['rows']) ? $block['rows'] : [];
    if ($heading !== '') {
        $hEsc = htmlspecialchars($heading, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $dot = (str_starts_with($heading, '●') || str_starts_with($heading, '・')) ? '' : '●';
        $tbodyHtml .= '<tr class="est-cat-row"><td colspan="5">' . $dot . $hEsc . '</td></tr>';
    }
    $idx = 0;
    foreach ($rows as $line) {
        if (!is_array($line)) {
            continue;
        }
        $idx++;
        $zebra = ($idx % 2 === 0) ? ' est-zebra' : '';
        $itemCode = isset($line['item_code']) && is_string($line['item_code']) ? trim($line['item_code']) : '';
        $isBlankRow = ($itemCode === ESTIMATE_BLANK_DETAIL_LINE_ITEM_CODE);
        $nameRaw = (string)($line['item_name'] ?? '');
        $name = htmlspecialchars($nameRaw, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $pref = '';
        if (!$isBlankRow && $nameRaw !== '') {
            $pref = (str_starts_with($nameRaw, '・') || str_starts_with($nameRaw, '●')) ? '' : '・';
        }
        $qty = htmlspecialchars($isBlankRow ? '' : estimateFormatQty($line['quantity'] ?? null), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $unit = htmlspecialchars(estimateUnitLabelJp(isset($line['unit_type']) && is_string($line['unit_type']) ? $line['unit_type'] : null), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $up = $isBlankRow ? '' : estimateFormatYen($line['unit_price'] ?? null);
        $am = $isBlankRow ? '' : estimateFormatYen($line['line_amount'] ?? null);
        if ($isBlankRow) {
            // 空白行でも通常明細行と同じ高さを維持するため、各セルに実体参照ではなく NBSP 文字を入れる。
            $nbsp = "\u{00A0}";
            $name = $nbsp;
            $qty = $nbsp;
            $unit = $nbsp;
            $up = $nbsp;
            $am = $nbsp;
        }
        $tbodyHtml .= '<tr class="est-data-row' . $zebra . '"><td class="est-col-content">' . $pref . $name . '</td>'
            . '<td class="est-col-num">' . $qty . '</td>'
            . '<td class="est-col-unit">' . $unit . '</td>'
            . '<td class="est-col-price">' . htmlspecialchars($up, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</td>'
            . '<td class="est-col-amt">' . htmlspecialchars($am, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</td></tr>';
    }
    if (count($rows) > 0) {
        $sub = estimateFormatYen(estimateBlockSubtotal($rows));
        $tbodyHtml .= '<tr class="est-subtotal-row"><td colspan="3"></td><td class="est-sub-lbl">小計</td><td class="est-col-amt">'
            . htmlspecialchars($sub, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</td></tr>';
    }
}

if ($tbodyHtml === '') {
    $tbodyHtml = '<tr class="est-data-row"><td colspan="5" class="est-col-content">明細がありません。</td></tr>';
}
if ($estimateSparseFillRows > 0) {
    for ($i = 0; $i < $estimateSparseFillRows; $i++) {
        $tbodyHtml .= '<tr class="est-fill-row"><td class="est-col-content">&nbsp;</td><td class="est-col-num"></td><td class="est-col-unit"></td><td class="est-col-price"></td><td class="est-col-amt"></td></tr>';
    }
}

$publicBase = getenv('APP_PUBLIC_BASE_URL') ?: '';
$publicBase = is_string($publicBase) ? rtrim($publicBase, '/') : '';

$recipientTrimmed = trim($recipient);
if ($recipientTrimmed !== '') {
    $recipientHtml = nl2br(htmlspecialchars($recipientTrimmed . "\u{3000}" . '様', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'));
    $clientLineEsc = htmlspecialchars($clientName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
} else {
    $recipientHtml = '';
    $clientLineEsc = htmlspecialchars($clientName !== '' ? ($clientName . "\u{3000}" . '御中') : '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
$subjectEsc = htmlspecialchars($subjectTitle !== '' ? $subjectTitle : '—', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$issueDateEsc = htmlspecialchars($issueDate !== '' ? $issueDate : '—', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$sheetClass = 'estimate-export-sheet' . ($isSparseDetailLayout ? ' est-layout-sparse' : '');
$sheetMainClass = 'est-sheet-main' . ($isSparseDetailLayout ? ' est-sheet-main-sparse' : '');
$detailZoneClass = 'est-detail-zone' . ($isSparseDetailLayout ? ' est-detail-zone-sparse' : '');

$css = <<<'CSS'
html { box-sizing: border-box; }
*, *::before, *::after { box-sizing: inherit; }
body { margin: 0; font-family: system-ui, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif; font-size: 10px; color: #1a1a1a; background: #fff; line-height: 1.35; }
.estimate-export-sheet {
  width: 210mm;
  max-width: 100%;
  min-height: 297mm;
  margin: 0 auto;
  padding: 1cm 8mm 6mm 8mm;
  background: #fff;
  box-shadow: none;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.est-sheet-main { flex: 1 1 auto; min-height: 0; }
.est-detail-zone { min-height: 0; }
/* 少行時もA4の白紙面は維持する（プレビュー/PDF/印刷の見え方統一） */
.estimate-export-sheet.est-layout-sparse { min-height: 297mm; }
.estimate-export-sheet.est-layout-sparse .est-sheet-main { flex: 1 1 auto; }
.est-doc-title { text-align: center; margin: 0 0 4px; font-size: 20px; font-weight: 700; letter-spacing: 0.04em; }
.est-doc-title-sub { text-align: center; margin: 0 0 12px; font-size: 11px; font-style: italic; color: #6b7280; }
.est-header-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto auto;
  gap: 10px 20px;
  margin-bottom: 12px;
  align-items: end;
}
.est-hg-r1c1,
.est-hg-r2c1 { min-width: 0; }
.est-hg-r1c2 {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: stretch;
  gap: 6px;
}
.est-hg-r2c2 { min-width: 0; }
.est-hg-r1c2 .est-top3 { margin-bottom: 0; }
.est-hg-r1c2 .est-meta-underline { margin-bottom: 0; }
.est-hg-r2c2 .est-meta-underline { margin-bottom: 0; }
.est-label-pair { margin: 0; }
.est-lbl { display: block; font-size: 8.5px; color: #6b7280; margin-bottom: 0; line-height: 1.15; }
.est-lbl-en { font-size: 8px; }
.est-client-line { display: block; font-size: 10px; margin-bottom: 3px; min-height: 1.2em; }
.est-val-block { display: block; width: 100%; border-bottom: 1pt solid #000; padding-bottom: 1px; padding-top: 1px; min-height: 2.4em; font-size: 10.5px; }
.est-header-grid .est-val-block {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  text-align: left;
}
.est-hg-r1c1 .est-client-line {
  font-size: calc(10px * 1.2);
  line-height: 1.25;
}
.est-hg-r1c1 .est-val-block {
  font-size: calc(10.5px * 0.8);
  line-height: 1.35;
}
.est-top3 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; margin-bottom: 6px; align-items: end; }
.est-top3-cell { min-width: 0; display: flex; flex-direction: column; justify-content: flex-end; }
.est-top3-cell .est-lbl { color: #000; }
.est-top3-cell .est-lbl .est-lbl-en { color: #6b7280; }
.est-top3-cell .est-val-block { color: #000; }
.est-meta-underline { width: calc(100% - 0.6mm); border-collapse: collapse; font-size: 9.5px; margin-bottom: 4px; margin-right: auto; }
.est-meta-underline th, .est-meta-underline td { border: none; border-bottom: 1pt solid #000; padding: 3px 4px 4px; vertical-align: bottom; }
.est-meta-underline th { font-weight: 600; text-align: left; width: 38%; white-space: nowrap; color: #374151; }
.est-meta-underline td { text-align: right; font-size: 10px; }
.est-total-bar {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  background: #e8e8e8;
  border: 1pt solid #b0b0b0;
  padding: calc(8px * 0.8) calc(12px * 0.8);
  margin-top: 3px;
  margin-bottom: 4px;
}
.est-total-bar-left { min-height: 0.8em; }
.est-total-bar-right { text-align: right; }
.est-tb-one {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: baseline;
  justify-content: flex-end;
  gap: 0;
  white-space: nowrap;
  max-width: 100%;
  line-height: 1.05;
}
.est-tb-lbl { font-size: 10px; font-weight: 600; display: inline; }
.est-tb-lbl small { font-weight: 400; color: #6b7280; margin-left: 4px; }
.est-tb-amt { font-size: 20px; font-weight: 800; letter-spacing: 0.02em; display: inline; line-height: 1; }
.est-detail-table { width: calc(100% - 0.6mm); border-collapse: collapse; margin-bottom: 0; font-size: 8.5px; margin-right: auto; }
.est-detail-table th, .est-detail-table td { border: 1pt solid #000; padding: 2px 4px; vertical-align: bottom; line-height: 1.2; }
.est-detail-table thead th { background: #333333; color: #fff; font-weight: 600; text-align: center; padding-top: 1px; padding-bottom: 2px; vertical-align: bottom; }
.est-detail-table thead th:first-child { text-align: left; width: 46%; }
.est-col-num { width: 9%; text-align: right; }
.est-col-unit { width: 10%; text-align: center; }
.est-col-price, .est-col-amt { width: 17%; text-align: right; white-space: nowrap; }
.est-data-row.est-zebra { background: #f7f7f7; }
.est-cat-row td { background: #e8e8e8; color: #000; font-weight: 700; padding: 3px 5px; }
.est-subtotal-row td { font-weight: 600; background: #fafafa; }
.est-sub-lbl { text-align: right; padding-right: 8px; }
.est-fill-row td {
  background: transparent;
}
/* 少行時は明細の行高を拡張して、総額〜フッター間の空きを明細側で吸収する */
.estimate-export-sheet.est-layout-sparse .est-cat-row td {
  padding-top: 5px;
  padding-bottom: 5px;
}
.estimate-export-sheet.est-layout-sparse .est-detail-table thead th {
  padding-top: 4px;
  padding-bottom: 4px;
  line-height: 1.45;
}
.estimate-export-sheet.est-layout-sparse .est-data-row td,
.estimate-export-sheet.est-layout-sparse .est-subtotal-row td,
.estimate-export-sheet.est-layout-sparse .est-fill-row td {
  padding-top: 4px;
  padding-bottom: 4px;
  line-height: 1.45;
}
.est-tax-footer { width: calc(100% - 0.6mm); display: grid; grid-template-columns: 1fr 1fr 1fr; border: 1pt solid #000; border-top: none; margin-bottom: 12px; margin-right: auto; }
.est-tax-footer > div {
  padding: 5px 6px;
  border-right: 1pt solid #000;
  text-align: center;
  font-size: 9px;
  display: flex;
  align-items: baseline;
  justify-content: center;
  flex-wrap: nowrap;
  white-space: nowrap;
  gap: 0.25em;
  color: #000;
  font-weight: 700;
}
.est-tax-footer > div:last-child { border-right: none; }
.est-tf-lbl { display: inline; color: #000; font-size: 8px; margin-bottom: 0; font-weight: 700; }
.est-tf-val { font-size: 11px; display: inline; color: #000; font-weight: 700; }
.est-page-footer {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: auto;
  padding-top: 8px;
  font-size: 8.5px;
  align-items: end;
}
.est-page-footer .est-issuer { justify-content: flex-end; }
.est-remarks-block { align-self: end; }
.est-remarks-block h3 { margin: 0 0 4px; font-size: 9px; font-weight: 700; }
.est-remarks-ul { margin: 0; padding-left: 1.1em; }
.est-remarks-empty { margin: 0; color: #9ca3af; }
.est-issuer {
  text-align: right;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  break-inside: avoid;
  page-break-inside: avoid;
}
.est-issuer .est-logo-wrap {
  margin: 0;
  display: flex;
  justify-content: flex-end;
  width: 100%;
}
.est-issuer .est-co-name {
  font-weight: 700;
  font-size: calc(10px * 1.5);
  line-height: 1.25;
  margin: 0;
  white-space: nowrap;
  break-inside: avoid;
  page-break-inside: avoid;
}
.est-issuer img {
  max-height: 40px;
  max-width: min(100%, 200px);
  width: auto;
  height: auto;
  display: block;
}
@media print {
  /* 上 1cm / 左右 8mm / 下 6mm（PDF・印刷共通）。用紙内に収め、表の左右罫線が欠けないよう幅は 100% */
  @page { size: A4 portrait; margin: 1cm 8mm 6mm 8mm; }
  html, body { height: 100%; margin: 0; }
  body { background: #fff; }
  html, body, body * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .estimate-export-sheet {
    width: 100%;
    max-width: none;
    min-height: 100%;
    margin: 0;
    padding: 0;
    box-shadow: none;
  }
  .estimate-export-sheet.est-layout-sparse { min-height: 100%; }
  .estimate-export-sheet.est-layout-sparse .est-sheet-main { flex: 1 1 auto; }
  .est-detail-table,
  .est-tax-footer,
  .est-meta-underline {
    width: calc(100% - 0.6mm);
    max-width: calc(100% - 0.6mm);
    margin-left: 0;
    margin-right: auto;
    box-sizing: border-box;
  }
}
CSS;

$logoPrimary = '/brand/logo.png';
$logoFallback = '/brand/alrfy-ai-logo.svg';

$html = '<!doctype html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Estimate</title>';
if ($publicBase !== '') {
    $html .= '<base href="' . htmlspecialchars($publicBase . '/', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '">';
}
$html .= '<style>' . $css . '</style></head><body>'
    . '<div class="' . htmlspecialchars($sheetClass, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '">'
    . '<div class="' . htmlspecialchars($sheetMainClass, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '">'
    . '<h1 class="est-doc-title">' . htmlspecialchars($docTitle, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</h1>'
    . '<p class="est-doc-title-sub">Quotation</p>'
    . '<header class="est-header-grid" aria-label="見積ヘッダ">'
    . '<div class="est-hg-r1c1 est-label-pair">'
    . '<span class="est-lbl">御見積先 <span class="est-lbl-en">Order-From</span></span>'
    . '<span class="est-client-line">' . $clientLineEsc . '</span>'
    . '<span class="est-val-block">' . $recipientHtml . '</span>'
    . '</div>'
    . '<div class="est-hg-r1c2 est-hg-right-top">'
    . '<div class="est-top3">'
    . '<div class="est-top3-cell"><span class="est-lbl">作成年月日 <span class="est-lbl-en">Issue Date</span></span><span class="est-val-block">' . $issueDateEsc . '</span></div>'
    . '<div class="est-top3-cell"><span class="est-lbl">納入予定 <span class="est-lbl-en">Lead time</span></span><span class="est-val-block">' . $deliveryDueEsc . '</span></div>'
    . '</div>'
    . '<table class="est-meta-underline" aria-label="見積番号"><tbody>'
    . '<tr><th>見積番号 <span style="font-weight:400;color:#6b7280">Quotation No.</span></th><td>' . $estimateNumber . '</td></tr>'
    . '</tbody></table>'
    . '</div>'
    . '<div class="est-hg-r2c1 est-label-pair">'
    . '<span class="est-lbl">件名 <span class="est-lbl-en">Title</span></span>'
    . '<span class="est-val-block">' . $subjectEsc . '</span>'
    . '</div>'
    . '<div class="est-hg-r2c2 est-hg-sales-wrap">'
    . '<table class="est-meta-underline" aria-label="営業担当"><tbody>'
    . '<tr><th>営業担当者 <span style="font-weight:400;color:#6b7280">Sales Rep.</span></th><td>' . $salesEsc . '</td></tr>'
    . '</tbody></table>'
    . '</div>'
    . '</header>'
    . '<div class="' . htmlspecialchars($detailZoneClass, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '">'
    . '<section class="est-total-bar" aria-label="税込合計">'
    . '<div class="est-total-bar-left"></div>'
    . '<div class="est-total-bar-right">'
    . '<span class="est-tb-one"><span class="est-tb-lbl">合計金額（税込） <small>Total Amount</small></span>'
    . "\u{3000}" . '<span class="est-tb-amt">' . htmlspecialchars($totalIncl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</span></span></div></section>'
    . '<table class="est-detail-table" aria-label="明細"><thead><tr>'
    . '<th>内容 <span style="font-weight:400;opacity:.9">Content</span></th>'
    . '<th class="est-col-num">数量 <span style="font-weight:400;opacity:.9">Qty</span></th>'
    . '<th class="est-col-unit">単位 <span style="font-weight:400;opacity:.9">Unit</span></th>'
    . '<th class="est-col-price">単価 <span style="font-weight:400;opacity:.9">U.price</span></th>'
    . '<th class="est-col-amt">金額 <span style="font-weight:400;opacity:.9">Amount</span></th>'
    . '</tr></thead><tbody>' . $tbodyHtml . '</tbody></table>'
    . '<div class="est-tax-footer" aria-label="税サマリー">'
    . '<div><span class="est-tf-lbl">税抜金額</span>' . "\u{3000}" . '<span class="est-tf-val">' . htmlspecialchars($subtotal, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</span></div>'
    . '<div><span class="est-tf-lbl">消費税額（' . htmlspecialchars($taxPercentStr, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '%）</span>' . "\u{3000}" . '<span class="est-tf-val">' . htmlspecialchars($taxAmt, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</span></div>'
    . '<div><span class="est-tf-lbl">税込み合計金額</span>' . "\u{3000}" . '<span class="est-tf-val">' . htmlspecialchars($totalIncl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</span></div>'
    . '</div>'
    . '</div>'
    . '</div>'
    . '<footer class="est-page-footer" aria-label="フッタ">'
    . '<div class="est-remarks-block"><h3>備考</h3>' . $remarksHtml . '</div>'
    . '<div class="est-issuer">'
    . '<div class="est-logo-wrap">'
    . '<img src="' . htmlspecialchars($logoPrimary, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '" alt="" '
    . 'onerror="this.onerror=null;this.src=\'' . htmlspecialchars($logoFallback, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '\';" />'
    . '</div>'
    . '<div class="est-co-name">' . $issuerNameEsc . '</div>';
if ($issuerAddr !== '') {
    $html .= '<div>' . $issuerAddrHtml . '</div>';
}
if ($issuerTel !== '' || $issuerFax !== '') {
    $html .= '<div>Tel.';
    if ($issuerTel !== '') {
        $html .= $issuerTelEsc;
    }
    $html .= '　Fax ';
    if ($issuerFax !== '') {
        $html .= $issuerFaxEsc;
    }
    $html .= '</div>';
}
if ($issuerUrl !== '') {
    $html .= '<div>URL: ' . $issuerUrlEsc . '</div>';
}
$html .= '</div></footer></div></body></html>';

echo json_encode(
    [
        'success' => true,
        'html' => $html,
        'a4_overflow_warning' => $isOverflowWarning,
    ],
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
);
