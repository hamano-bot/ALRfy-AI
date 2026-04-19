import { format } from "date-fns";
import { displayText } from "@/lib/empty-display";
import type { HearingSheetRow } from "@/lib/hearing-sheet-types";

const WIN_INVALID_FILE_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

/** Excel 上の游ゴシック（日本語環境の表示名に合わせる） */
const HEARING_EXPORT_FONT = "游ゴシック";

/** 列幅（Excel の標準桁幅に相当） */
const COLUMN_WIDTHS = [20, 30, 60, 60, 20, 20, 20] as const;

const BLACK = { argb: "FF000000" } as const;

/** Windows 等で使えない文字を除き、先頭末尾のドット・空白を落とす */
export function sanitizeFileNameSegment(input: string): string {
  const t = input
    .trim()
    .replace(WIN_INVALID_FILE_NAME_CHARS, "_")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "");
  return t;
}

export function buildHearingSheetExportBaseName(projectName: string, clientName: string): string {
  const ts = format(new Date(), "yyyyMMdd_HHmmss");
  const proj = sanitizeFileNameSegment(displayText(projectName)) || "案件";
  const client = sanitizeFileNameSegment(displayText(clientName)) || "クライアント未設定";
  return `${ts}_ヒアリングシート_${proj}_${client}`;
}

const HEADER_ROW = ["分類", "見出し", "確認事項", "回答", "担当", "期限", "状況"] as const;

function hearingRowHasAnyValue(r: HearingSheetRow): boolean {
  return [r.category, r.heading, r.question, r.answer, r.assignee, r.due, r.row_status].some(
    (v) => String(v ?? "").trim() !== "",
  );
}

const THIN_ALL_SIDES = {
  top: { style: "thin" as const, color: BLACK },
  left: { style: "thin" as const, color: BLACK },
  bottom: { style: "thin" as const, color: BLACK },
  right: { style: "thin" as const, color: BLACK },
};

/** 確認事項の全データ行を .xlsx でダウンロード（画面の「完了を除く」フィルタは反映しない） */
export async function downloadHearingRowsExcel(
  rows: HearingSheetRow[],
  projectName: string,
  clientName: string | null | undefined,
): Promise<void> {
  const { Workbook } = await import("exceljs");
  const base = buildHearingSheetExportBaseName(projectName, clientName ?? "");
  const fileName = `${base}.xlsx`;

  const workbook = new Workbook();
  workbook.creator = "ALRfy Project Manager";
  const sheet = workbook.addWorksheet("ヒアリング", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  COLUMN_WIDTHS.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  const baseFont = { name: HEARING_EXPORT_FONT, size: 11 } as const;
  const alignTopLeft = { vertical: "top" as const, horizontal: "left" as const, wrapText: true };

  const headerRow = sheet.addRow([...HEADER_ROW]);
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { ...baseFont };
    cell.alignment = alignTopLeft;
    cell.border = {
      top: { style: "thin", color: BLACK },
      left: { style: "thin", color: BLACK },
      bottom: { style: "double", color: BLACK },
      right: { style: "thin", color: BLACK },
    };
  });

  /** いずれかの列に値がある最後の行（0-based）。該当なしは -1 */
  let lastGridRowIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    if (hearingRowHasAnyValue(rows[i])) {
      lastGridRowIndex = i;
    }
  }

  // セル値は DB の本文のみ。画面上の URL クリップアイコン等は DOM 専用のため、ここでは列を増やしたり埋め込まない。
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const values = [r.category, r.heading, r.question, r.answer, r.assignee, r.due, r.row_status];
    const row = sheet.addRow(values);
    const insideGrid = i <= lastGridRowIndex;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { ...baseFont };
      cell.alignment = alignTopLeft;
      if (insideGrid) {
        cell.border = THIN_ALL_SIDES;
      }
    });
  }

  const buf = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
