import ExcelJS from "exceljs";
import {
  computeEstimateLineAmount,
  ESTIMATE_A4_HTML_EXPORT_ROW_BUDGET,
  countEstimateHtmlExportRowBudget,
  groupEstimateLinesForHtmlExport,
} from "@/lib/portal-estimate";

export type EstimateIssuerForXlsx = {
  name: string;
  addr: string;
  tel: string;
  fax: string;
  url: string;
};

function formatYen(n: unknown): string {
  const v = typeof n === "number" && Number.isFinite(n) ? n : Number(n);
  const x = Number.isFinite(v) ? Math.round(v) : 0;
  return `¥${x.toLocaleString("ja-JP")}`;
}

function formatQty(n: unknown): string {
  if (typeof n === "number" && Number.isFinite(n)) {
    if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
    return String(Number(n.toFixed(4))).replace(/\.?0+$/, "");
  }
  const v = Number(n);
  return Number.isFinite(v) ? formatQty(v) : "0";
}

function unitLabelJp(unitType: string | null | undefined): string {
  const u = unitType != null ? String(unitType).trim() : "";
  const m: Record<string, string> = {
    person_month: "人月",
    person_day: "人日",
    set: "式",
    page: "ページ",
    times: "回",
    percent: "%",
    monthly_fee: "月額",
    annual_fee: "年額",
  };
  return m[u] ?? (u !== "" ? u : "式");
}

function formatIssueDate(ymd: string | null | undefined): string {
  const s = String(ymd ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : s;
}

function blockSubtotal(rows: Array<Record<string, unknown>>): number {
  let s = 0;
  for (const row of rows) {
    const amt = row.line_amount;
    if (typeof amt === "number" && Number.isFinite(amt)) s += amt;
    else if (amt != null && Number.isFinite(Number(amt))) s += Number(amt);
  }
  return s;
}

function remarksPlain(remarksRaw: string): string {
  const t = remarksRaw.replace(/\uFEFF/g, "").trim();
  if (t === "") return "";
  return t
    .split(/\r\n|\n|\r/)
    .map((line) => {
      let x = line.trim();
      if (x.startsWith("- ")) x = x.slice(2).trim();
      else if (x.startsWith("・")) x = x.slice(1).trim();
      else if (x.startsWith("-")) x = x.slice(1).trim();
      return `・${x}`;
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * プレビュー HTML 帳票に近いブロック構造・文言で xlsx を生成する（ExcelJS）。
 */
export async function buildEstimateXlsxBuffer(
  estimate: Record<string, unknown>,
  issuer: EstimateIssuerForXlsx,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("御見積書", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: false, fitToWidth: 1, fitToHeight: 0 },
    views: [{ showGridLines: false }],
  });

  const docTitle = Number(estimate.is_rough_estimate ?? 0) === 1 ? "概算御見積書" : "御見積書";
  const clientName = typeof estimate.client_name === "string" ? estimate.client_name.trim() : "";
  const recipient = String(estimate.recipient_text ?? "").trim();
  const subject = typeof estimate.title === "string" ? estimate.title.trim() : "";
  const issueDate = formatIssueDate(typeof estimate.issue_date === "string" ? estimate.issue_date : "");
  const deliveryRaw = typeof estimate.delivery_due_text === "string" ? estimate.delivery_due_text.trim() : "";
  const deliveryDisplay =
    deliveryRaw !== "" && /^\d{4}-\d{2}-\d{2}$/.test(deliveryRaw) ? formatIssueDate(deliveryRaw) : deliveryRaw !== "" ? deliveryRaw : "—";
  const estimateNumber = String(estimate.estimate_number ?? "").trim();
  const salesLabel =
    typeof estimate.sales_user_label === "string" && estimate.sales_user_label.trim() !== ""
      ? estimate.sales_user_label.trim()
      : "—";
  const taxPct = Number(estimate.applied_tax_rate_percent ?? 10);
  const taxPctStr = String(Number(taxPct.toFixed(2))).replace(/\.?0+$/, "");
  const subtotal = formatYen(estimate.subtotal_excluding_tax);
  const taxAmt = formatYen(estimate.tax_amount);
  const totalIncl = formatYen(estimate.total_including_tax);
  const remarks = remarksPlain(typeof estimate.remarks === "string" ? estimate.remarks : "");

  const linesRaw = Array.isArray(estimate.lines) ? estimate.lines : [];
  const lines: Record<string, unknown>[] = linesRaw.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  const blocks = groupEstimateLinesForHtmlExport(lines);

  const thin: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FF000000" } };
  const allBorders: Partial<ExcelJS.Borders> = {
    top: thin,
    left: thin,
    bottom: thin,
    right: thin,
  };

  let r = 1;
  ws.mergeCells(r, 1, r, 5);
  const t1 = ws.getCell(r, 1);
  t1.value = docTitle;
  t1.font = { size: 20, bold: true };
  t1.alignment = { horizontal: "center", vertical: "middle" };
  r += 1;
  ws.mergeCells(r, 1, r, 5);
  ws.getCell(r, 1).value = "Quotation";
  ws.getCell(r, 1).font = { size: 11, italic: true, color: { argb: "FF6B7280" } };
  ws.getCell(r, 1).alignment = { horizontal: "center" };
  r += 2;

  ws.mergeCells(r, 1, r, 5);
  ws.getCell(r, 1).value = "御見積先 Order-From";
  ws.getCell(r, 1).font = { size: 9, color: { argb: "FF6B7280" } };
  r += 1;
  ws.mergeCells(r, 1, r, 5);
  ws.getCell(r, 1).value = clientName !== "" ? clientName : "—";
  ws.getCell(r, 1).font = { size: 11, bold: true };
  r += 1;
  ws.mergeCells(r, 1, r, 5);
  ws.getCell(r, 1).value = recipient !== "" ? recipient : "—";
  ws.getCell(r, 1).alignment = { wrapText: true };
  r += 1;

  ws.getCell(r, 1).value = "作成年月日 Issue Date";
  ws.getCell(r, 1).font = { size: 9, color: { argb: "FF6B7280" } };
  ws.getCell(r, 2).value = issueDate !== "" ? issueDate : "—";
  ws.getCell(r, 2).font = { size: 10, color: { argb: "FF000000" } };
  ws.getCell(r, 4).value = "納入予定 Lead time";
  ws.getCell(r, 4).font = { size: 9, color: { argb: "FF6B7280" } };
  ws.getCell(r, 5).value = deliveryDisplay;
  ws.getCell(r, 5).font = { size: 10, color: { argb: "FF000000" } };
  r += 1;

  ws.getCell(r, 1).value = "見積番号 Quotation No.";
  ws.getCell(r, 1).font = { bold: true, size: 9 };
  ws.mergeCells(r, 2, r, 5);
  ws.getCell(r, 2).value = estimateNumber !== "" ? estimateNumber : "—";
  ws.getCell(r, 2).alignment = { horizontal: "right" };
  ws.getCell(r, 2).font = { size: 10 };
  for (let c = 1; c <= 5; c++) {
    ws.getCell(r, c).border = { bottom: thin };
  }
  r += 2;

  ws.getCell(r, 1).value = "件名 Title";
  ws.getCell(r, 1).font = { size: 9, color: { argb: "FF6B7280" } };
  ws.mergeCells(r, 2, r, 3);
  ws.getCell(r, 2).value = subject !== "" ? subject : "—";
  ws.getCell(r, 2).alignment = { wrapText: true };
  ws.getCell(r, 4).value = "営業担当者 Sales Rep.";
  ws.getCell(r, 4).font = { size: 9, color: { argb: "FF6B7280" } };
  ws.getCell(r, 5).value = salesLabel;
  ws.getCell(r, 5).alignment = { horizontal: "right" };
  for (let c = 1; c <= 5; c++) {
    ws.getCell(r, c).border = { bottom: thin };
  }
  r += 2;

  ws.mergeCells(r, 1, r, 5);
  const tb = ws.getCell(r, 1);
  tb.value = `合計金額（税込） Total Amount     ${totalIncl}`;
  tb.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };
  tb.border = allBorders;
  tb.font = { bold: true, size: 11 };
  tb.alignment = { horizontal: "right", vertical: "middle" };
  r += 2;

  const hdr = ["内容 Content", "数量 Qty", "単位 Unit", "単価 U.price", "金額 Amount"];
  for (let c = 0; c < 5; c++) {
    const cell = ws.getCell(r, c + 1);
    cell.value = hdr[c];
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF333333" } };
    cell.border = allBorders;
    cell.alignment = { horizontal: c === 0 ? "left" : c >= 3 ? "right" : "center", vertical: "middle", wrapText: true };
  }
  r += 1;

  for (const block of blocks) {
    const heading = block.heading.trim();
    if (heading !== "") {
      ws.mergeCells(r, 1, r, 5);
      const c0 = ws.getCell(r, 1);
      const dot = heading.startsWith("●") || heading.startsWith("・") ? "" : "●";
      c0.value = `${dot}${heading}`;
      c0.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };
      c0.font = { bold: true, size: 9 };
      c0.border = allBorders;
      r += 1;
    }
    let idx = 0;
    for (const line of block.rows) {
      idx++;
      const zebraRow = idx % 2 === 0;
      const name = String(line.item_name ?? "");
      const pref = name.startsWith("・") || name.startsWith("●") ? "" : "・";
      const qty = formatQty(line.quantity ?? 0);
      const unit = unitLabelJp(typeof line.unit_type === "string" ? line.unit_type : undefined);
      const up = formatYen(line.unit_price ?? 0);
      let am = formatYen(line.line_amount ?? 0);
      if (line.line_amount == null || !Number.isFinite(Number(line.line_amount))) {
        const calc = computeEstimateLineAmount({
          quantity: Number(line.quantity ?? 0),
          unit_price: Number(line.unit_price ?? 0),
          factor: line.factor != null ? Number(line.factor) : 1,
          unit_type: typeof line.unit_type === "string" ? line.unit_type : "set",
        });
        am = formatYen(calc);
      }
      const rowFill = zebraRow ? { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFF7F7F7" } } : undefined;
      ws.getCell(r, 1).value = `${pref}${name}`;
      ws.getCell(r, 2).value = qty;
      ws.getCell(r, 2).alignment = { horizontal: "right" };
      ws.getCell(r, 3).value = unit;
      ws.getCell(r, 3).alignment = { horizontal: "center" };
      ws.getCell(r, 4).value = up;
      ws.getCell(r, 4).alignment = { horizontal: "right" };
      ws.getCell(r, 5).value = am;
      ws.getCell(r, 5).alignment = { horizontal: "right" };
      for (let c = 1; c <= 5; c++) {
        const cell = ws.getCell(r, c);
        cell.border = allBorders;
        cell.font = { size: 9 };
        if (rowFill) cell.fill = rowFill;
      }
      r += 1;
    }
    if (block.rows.length > 0) {
      ws.mergeCells(r, 1, r, 3);
      ws.getCell(r, 4).value = "小計";
      ws.getCell(r, 4).alignment = { horizontal: "right" };
      ws.getCell(r, 4).font = { bold: true, size: 9 };
      ws.getCell(r, 5).value = formatYen(blockSubtotal(block.rows as Record<string, unknown>[]));
      ws.getCell(r, 5).alignment = { horizontal: "right" };
      ws.getCell(r, 5).font = { bold: true, size: 9 };
      for (let c = 1; c <= 5; c++) {
        ws.getCell(r, c).border = allBorders;
        ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFAFA" } };
      }
      r += 1;
    }
  }

  if (blocks.every((b) => b.rows.length === 0) && blocks.length <= 1) {
    ws.mergeCells(r, 1, r, 5);
    ws.getCell(r, 1).value = "明細がありません。";
    ws.getCell(r, 1).border = allBorders;
    r += 1;
  }

  ws.mergeCells(r, 1, r, 2);
  ws.getCell(r, 1).value = `税抜金額\n${subtotal}`;
  ws.getCell(r, 1).alignment = { horizontal: "center", wrapText: true };
  ws.getCell(r, 1).font = { bold: true, size: 9 };
  ws.getCell(r, 1).border = allBorders;
  ws.getCell(r, 3).value = `消費税額（${taxPctStr}%）\n${taxAmt}`;
  ws.getCell(r, 3).alignment = { horizontal: "center", wrapText: true };
  ws.getCell(r, 3).font = { bold: true, size: 9 };
  ws.getCell(r, 3).border = allBorders;
  ws.mergeCells(r, 4, r, 5);
  ws.getCell(r, 4).value = `税込み合計金額\n${totalIncl}`;
  ws.getCell(r, 4).alignment = { horizontal: "center", wrapText: true };
  ws.getCell(r, 4).font = { bold: true, size: 9 };
  ws.getCell(r, 4).border = allBorders;
  r += 2;

  ws.getCell(r, 1).value = "備考";
  ws.getCell(r, 1).font = { bold: true, size: 9 };
  r += 1;
  ws.mergeCells(r, 1, r, 3);
  ws.getCell(r, 1).value = remarks !== "" ? remarks : "—";
  ws.getCell(r, 1).alignment = { wrapText: true, vertical: "top" };
  ws.getCell(r, 1).font = { size: 9 };

  ws.mergeCells(r, 4, r, 5);
  ws.getCell(r, 4).value = `${issuer.name}\n${issuer.addr}\nTel.${issuer.tel}　Fax ${issuer.fax}\nURL: ${issuer.url}`;
  ws.getCell(r, 4).alignment = { horizontal: "right", wrapText: true, vertical: "top" };
  ws.getCell(r, 4).font = { size: 9, bold: true };

  ws.getColumn(1).width = 42;
  ws.getColumn(2).width = 10;
  ws.getColumn(3).width = 10;
  ws.getColumn(4).width = 14;
  ws.getColumn(5).width = 16;

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export function estimateA4OverflowFromLines(lines: ReadonlyArray<Record<string, unknown>>): boolean {
  return countEstimateHtmlExportRowBudget(lines) > ESTIMATE_A4_HTML_EXPORT_ROW_BUDGET;
}
