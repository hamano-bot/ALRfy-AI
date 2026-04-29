import { z, ZodIssueCode } from "zod";

/** `EstimateEditorClient` / PHP `post_estimate_export_html.php` と同一。大項目行は見出し空でも保存可。 */
export const ESTIMATE_MAJOR_LINE_ITEM_CODE = "__ESTIMATE_MAJOR__";
/** 新規明細の空の通常行など。項目名が空でも下書き保存できるように Zod で大項目・空白行と同様に除外する。 */
export const ESTIMATE_MANUAL_DETAIL_LINE_ITEM_CODE = "__ESTIMATE_MANUAL_DETAIL__";
/** `EstimateEditorClient` と同一。帳票/プレビュー上の空白行。 */
export const ESTIMATE_BLANK_DETAIL_LINE_ITEM_CODE = "__ESTIMATE_BLANK_DETAIL__";

/**
 * HTML 帳票 `post_estimate_export_html.php` の `$rowCountForWarning` しきい値と同期すること。
 * 各大項目ブロックで「見出し1 + 明細行数 + 小計1」を加算した合計がこの値を超えると `a4_overflow_warning`。
 */
export const ESTIMATE_A4_HTML_EXPORT_ROW_BUDGET = 22;

/** 帳票の大項目ブロック分割用（PHP `estimateGroupLinesForExport` と同じ規則） */
export type EstimateExportLineRow = {
  item_code?: string | null;
  item_name?: string;
  major_category?: string | null;
  category?: string | null;
  quantity?: number;
  unit_type?: string;
  unit_price?: number;
  line_amount?: number;
  factor?: number;
};

export type EstimateExportBlock = { heading: string; rows: EstimateExportLineRow[] };

export function groupEstimateLinesForHtmlExport(lines: ReadonlyArray<EstimateExportLineRow>): EstimateExportBlock[] {
  const blocks: EstimateExportBlock[] = [];
  for (const line of lines) {
    const code = line.item_code != null && String(line.item_code).trim() !== "" ? String(line.item_code).trim() : "";
    if (code === ESTIMATE_MAJOR_LINE_ITEM_CODE) {
      let title = typeof line.item_name === "string" ? line.item_name.trim() : "";
      if (title === "") {
        const mc = line.major_category != null && typeof line.major_category === "string" ? line.major_category.trim() : "";
        title = mc !== "" ? mc : "大項目";
      }
      blocks.push({ heading: title, rows: [] });
      continue;
    }
    if (blocks.length === 0) {
      blocks.push({ heading: "", rows: [] });
    }
    blocks[blocks.length - 1]!.rows.push(line);
  }
  if (blocks.length === 0) {
    blocks.push({ heading: "", rows: [] });
  }
  return blocks;
}

/** 帳票 HTML と同じ行換算（各大項目ブロックで見出し1 + 明細 + 小計1） */
export function countEstimateHtmlExportRowBudget(lines: ReadonlyArray<EstimateExportLineRow>): number {
  let rowCount = 0;
  for (const b of groupEstimateLinesForHtmlExport(lines)) {
    rowCount += 1 + b.rows.length + 1;
  }
  return rowCount;
}

export function estimateHtmlExceedsA4RowBudget(lines: ReadonlyArray<EstimateExportLineRow>): boolean {
  return countEstimateHtmlExportRowBudget(lines) > ESTIMATE_A4_HTML_EXPORT_ROW_BUDGET;
}

/** 単位が % のときは数量をパーセント値（例: 15 = 15%）とみなし (数量/100)×単価×係数。それ以外は 数量×単価×係数。 */
export function computeEstimateLineAmount(input: {
  quantity: number;
  unit_price: number;
  factor?: number | null;
  unit_type: string;
}): number {
  const q = Number.isFinite(input.quantity) ? input.quantity : 0;
  const p = Number.isFinite(input.unit_price) ? input.unit_price : 0;
  const f = input.factor != null && Number.isFinite(input.factor) ? input.factor : 1;
  if (input.unit_type === "percent") {
    return Number(((q / 100) * p * f).toFixed(2));
  }
  return Number((q * p * f).toFixed(2));
}

export const estimateLineSchema = z
  .object({
    sort_order: z.number().int().nonnegative().optional(),
    major_category: z.string().trim().max(100).nullable().optional(),
    category: z.string().trim().max(100).nullable().optional(),
    item_code: z.string().trim().max(100).nullable().optional(),
    item_name: z.string().trim().max(255),
    quantity: z.number().finite().nullable(),
    unit_type: z
      .enum([
        "person_month",
        "person_day",
        "set",
        "page",
        "times",
        "percent",
        "monthly_fee",
        "annual_fee",
      ])
      .default("set"),
    unit_price: z.number().finite().nullable(),
    factor: z.number().finite().default(1),
  })
  .superRefine((line, ctx) => {
    const code =
      line.item_code != null && String(line.item_code).trim() !== "" ? String(line.item_code).trim() : null;
    const isMajor = code === ESTIMATE_MAJOR_LINE_ITEM_CODE;
    const isBlank = code === ESTIMATE_BLANK_DETAIL_LINE_ITEM_CODE;
    const isManualDetail = code === ESTIMATE_MANUAL_DETAIL_LINE_ITEM_CODE;
    if (!isMajor && !isBlank && !isManualDetail && line.item_name.trim().length === 0) {
      ctx.addIssue({
        code: ZodIssueCode.custom,
        message: "項目名は1文字以上で入力してください。",
        path: ["item_name"],
      });
    }
  });

export const estimateUpsertSchema = z.object({
  id: z.number().int().positive().optional(),
  /** 複数案件リンク（保存時はこちらを優先。先頭が project_estimates.project_id に同期） */
  project_ids: z.array(z.number().int().positive()).max(30).optional(),
  project_id: z.number().int().positive().nullable().optional(),
  title: z.string().trim().min(1).max(255),
  estimate_status: z.enum(["draft", "submitted", "won", "lost"]).default("draft"),
  is_rough_estimate: z.boolean().optional(),
  client_name: z.string().trim().max(255).nullable().optional(),
  client_abbr: z.string().trim().max(64).nullable().optional(),
  recipient_text: z.string().max(4000).nullable().optional(),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** 納入予定: YYYY-MM-DD または「要相談」等の文言（最大255文字） */
  delivery_due_text: z.string().trim().max(255).nullable().optional(),
  visibility_scope: z.enum(["public_all_users", "restricted"]).optional(),
  /** 顧客向け備考（プレビュー・HTML 帳票に表示。社内メモとは別） */
  remarks: z.string().max(8000).nullable().optional(),
  internal_memo: z.string().max(8000).nullable().optional(),
  applied_tax_rate_percent: z.number().finite().optional(),
  /** 営業担当（ユーザー ID）。null は未割当（PATCH でのみ）。新規 POST で省略時は PHP 側で実行者を既定とする。 */
  sales_user_id: z.number().int().positive().nullable().optional(),
  lines: z.array(estimateLineSchema).default([]),
});

/** PHP 側が JSON としてそのまま保存する。明細は行オブジェクトの配列想定だが BFF では厳密型付けしない（Zod の record が配列要素で失敗するケースを避ける） */
export const estimateTemplatePostSchema = z.object({
  name: z.string().trim().min(1).max(200),
  scope: z.enum(["private", "shared"]).default("private"),
  header: z.any().optional(),
  lines: z.any().optional(),
});

export const estimateTemplatePatchSchema = z.object({
  id: z.string().trim().min(1).max(36),
  name: z.string().trim().min(1).max(200).optional(),
  scope: z.enum(["private", "shared"]).optional(),
  header: z.any().optional(),
  lines: z.any().optional(),
  locked: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional(),
});

export const estimateDuplicateSchema = z.object({
  estimate_id: z.number().int().positive(),
});

export const estimateLineDuplicateSchema = z.object({
  line_id: z.number().int().positive(),
});

export const taxRatePostSchema = z.object({
  tax_rate_percent: z.number().finite(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const taxRatePatchSchema = z.object({
  id: z.number().int().positive(),
  tax_rate_percent: z.number().finite().optional(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  is_active: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
});
