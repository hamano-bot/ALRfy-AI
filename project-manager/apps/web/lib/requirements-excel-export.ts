import { format } from "date-fns";
import type { JSONContent } from "@tiptap/core";
import { displayText } from "@/lib/empty-display";
import type {
  RequirementsDocBody,
  RequirementsPage,
  RequirementsPageContentSplit,
  RequirementsPageContentTable,
} from "@/lib/requirements-doc-types";
import type { SitemapNode } from "@/lib/requirements-sitemap-schema";
import { sanitizeFileNameSegment } from "@/lib/hearing-excel-export";

const EXCEL_EXPORT_FONT = "游ゴシック";
const BLACK = { argb: "FF000000" } as const;
const LIGHT_GRAY = { argb: "FFF1F5F9" } as const;
const WHITE = { argb: "FFFFFFFF" } as const;
const SECTION_GAP = 1;
const MAX_SHEET_NAME_LENGTH = 31;
type RichLine = {
  text: string;
  fontSize?: number;
  bold?: boolean;
  indent?: number;
};

type WorksheetLike = {
  columns?: Array<{ width?: number }>;
  mergeCells: (startRow: number, startCol: number, endRow: number, endCol: number) => void;
  getRow: (row: number) => {
    height?: number;
    getCell: (col: number) => {
      value: unknown;
      font?: unknown;
      fill?: unknown;
      border?: unknown;
      alignment?: unknown;
      numFmt?: string;
    };
  };
};

function requirementsExportBaseName(projectName: string): string {
  const ts = format(new Date(), "yyyyMMdd_HHmmss");
  const proj = sanitizeFileNameSegment(displayText(projectName)) || "案件";
  return `${ts}_要件定義_${proj}`;
}

function sanitizeSheetName(name: string, fallback: string): string {
  const replaced = name.replace(/[:\\/?*\[\]]/g, "_").trim();
  const normalized = replaced.length > 0 ? replaced : fallback;
  return normalized.slice(0, MAX_SHEET_NAME_LENGTH);
}

function uniqueSheetName(source: string, used: Set<string>, fallback: string): string {
  const base = sanitizeSheetName(source, fallback);
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let i = 2;
  while (i < 10_000) {
    const suffix = `_${i}`;
    const name = base.slice(0, Math.max(1, MAX_SHEET_NAME_LENGTH - suffix.length)) + suffix;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    i += 1;
  }
  const emergency = `${fallback.slice(0, 26)}_dup`;
  used.add(emergency);
  return emergency;
}

function tableRowsFromContent(content: RequirementsPageContentTable): string[][] {
  const headers = content.columnLabels.length > 0 ? content.columnLabels : ["列1"];
  return content.rows.map((r) => headers.map((_, ci) => (typeof r.cells[ci] === "string" ? r.cells[ci] : "")));
}

function flattenRichtextLines(doc: JSONContent | undefined): RichLine[] {
  if (!doc) {
    return [{ text: "（内容なし）" }];
  }
  const lines: RichLine[] = [];
  const toText = (nodes: JSONContent[] | undefined): string =>
    (nodes ?? [])
      .map((n) => {
        if (n.type === "text") {
          return typeof n.text === "string" ? n.text : "";
        }
        if (n.type === "hardBreak") {
          return "\n";
        }
        return toText(n.content);
      })
      .join("");
  const walk = (node: JSONContent, listDepth: number) => {
    if (node.type === "text") {
      return typeof node.text === "string" ? node.text : "";
    }
    const childText = toText(node.content);
    switch (node.type) {
      case "doc":
        break;
      case "paragraph":
        lines.push({ text: childText || "", fontSize: 11 });
        break;
      case "heading": {
        const level = typeof node.attrs?.level === "number" ? node.attrs.level : 2;
        const sizeMap: Record<number, number> = { 1: 20, 2: 16, 3: 14, 4: 13, 5: 12, 6: 11 };
        const safeLevel = Math.min(6, Math.max(1, level));
        lines.push({ text: childText.trim(), fontSize: sizeMap[safeLevel], bold: true });
        break;
      }
      case "bulletList":
      case "orderedList":
        (node.content ?? []).forEach((child) => walk(child, listDepth + 1));
        break;
      case "listItem":
        lines.push({ text: `- ${childText}`.trimEnd(), fontSize: 11, indent: Math.max(0, listDepth - 1) * 2 });
        break;
      case "blockquote":
        lines.push({ text: childText, fontSize: 11, indent: 2 });
        break;
      case "codeBlock":
        lines.push({ text: childText, fontSize: 10 });
        break;
      case "hardBreak":
        lines.push({ text: "", fontSize: 11 });
        break;
      case "table":
        lines.push({ text: "[表]", fontSize: 11, bold: true });
        (node.content ?? []).forEach((rowNode, rowIndex) => {
          const cells = (rowNode.content ?? []).map((cellNode) => toText(cellNode.content).trim());
          lines.push({ text: `${rowIndex === 0 ? "H" : "R"} | ${cells.join(" | ")}`, fontSize: 11 });
        });
        break;
      case "image": {
        const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
        if (src) {
          lines.push({ text: `[画像] ${src}`, fontSize: 10 });
        }
        break;
      }
      default:
        if (childText) {
          lines.push({ text: childText, fontSize: 11 });
        }
        break;
    }
    return "";
  };
  walk(doc, 0);
  return lines.length > 0 ? lines : [{ text: "（内容なし）" }];
}

function flattenSitemapRows(root: SitemapNode): Array<{ level: number; path: string; screenName: string; nodeId: string }> {
  const rows: Array<{ level: number; path: string; screenName: string; nodeId: string }> = [];
  const walk = (node: SitemapNode, level: number) => {
    rows.push({
      level,
      path: node.labels.join(" / "),
      screenName: node.screenName || "",
      nodeId: node.id,
    });
    node.children.forEach((c) => walk(c, level + 1));
  };
  walk(root, 1);
  return rows;
}

function setCellBase(
  sheet: WorksheetLike,
  row: number,
  col: number,
  value: string,
  opts?: { bold?: boolean; center?: boolean; fillHeader?: boolean; fontSize?: number; indent?: number },
) {
  const cell = sheet.getRow(row).getCell(col);
  cell.value = value;
  cell.font = { name: EXCEL_EXPORT_FONT, size: opts?.fontSize ?? 11, bold: opts?.bold === true };
  cell.alignment = {
    vertical: "top",
    horizontal: opts?.center ? "center" : "left",
    wrapText: true,
    indent: opts?.indent ?? 0,
  };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: opts?.fillHeader ? LIGHT_GRAY : WHITE,
  };
  cell.border = {
    top: { style: "thin", color: BLACK },
    left: { style: "thin", color: BLACK },
    bottom: { style: "thin", color: BLACK },
    right: { style: "thin", color: BLACK },
  };
}

function writePageHeader(sheet: WorksheetLike, page: RequirementsPage): number {
  sheet.mergeCells(1, 1, 1, 8);
  setCellBase(sheet, 1, 1, page.title || page.pageType || "ページ", { bold: true });
  sheet.getRow(1).height = 24;

  sheet.mergeCells(2, 1, 2, 8);
  setCellBase(
    sheet,
    2,
    1,
    `作成日: ${page.createdOn || "-"} / 最終更新日: ${page.updatedOn || "-"}`,
  );
  return 4;
}

function writeRichtext(sheet: WorksheetLike, doc: JSONContent | undefined, rowStart: number): number {
  const lines = flattenRichtextLines(doc);
  let row = rowStart;
  lines.forEach((line) => {
    sheet.mergeCells(row, 1, row, 8);
    setCellBase(sheet, row, 1, line.text, {
      bold: line.bold,
      fontSize: line.fontSize,
      indent: line.indent,
    });
    if ((line.fontSize ?? 11) >= 16) {
      sheet.getRow(row).height = 24;
    }
    row += 1;
  });
  return row + SECTION_GAP;
}

function writeTable(sheet: WorksheetLike, content: RequirementsPageContentTable, rowStart: number, startCol = 1): number {
  const headers = content.columnLabels.length > 0 ? content.columnLabels : ["列1"];
  const rows = tableRowsFromContent(content);
  let row = rowStart;
  headers.forEach((label, ci) => setCellBase(sheet, row, startCol + ci, label || `列${ci + 1}`, { bold: true, fillHeader: true }));
  row += 1;
  if (rows.length === 0) {
    setCellBase(sheet, row, startCol, "（内容なし）");
    row += 1;
  } else {
    rows.forEach((r) => {
      headers.forEach((_, ci) => setCellBase(sheet, row, startCol + ci, r[ci] ?? ""));
      row += 1;
    });
  }
  return row + SECTION_GAP;
}

function writeSplit(sheet: WorksheetLike, content: RequirementsPageContentSplit, rowStart: number): number {
  const leftLines = flattenRichtextLines(content.editorDoc);
  const tableRows = tableRowsFromContent(content);
  const tableHeight = Math.max(1, tableRows.length + 1);
  const bodyHeight = Math.max(leftLines.length, tableHeight);
  let row = rowStart;

  setCellBase(sheet, row, 1, "本文（5/8）", { bold: true, fillHeader: true });
  sheet.mergeCells(row, 1, row, 5);
  content.columnLabels.forEach((label, ci) => setCellBase(sheet, row, 6 + ci, label || `列${ci + 1}`, { bold: true, fillHeader: true }));
  row += 1;

  for (let i = 0; i < bodyHeight; i++) {
    sheet.mergeCells(row + i, 1, row + i, 5);
    const richLine = leftLines[i];
    setCellBase(sheet, row + i, 1, richLine?.text ?? "", {
      bold: richLine?.bold,
      fontSize: richLine?.fontSize,
      indent: richLine?.indent,
    });
    if ((richLine?.fontSize ?? 11) >= 16) {
      sheet.getRow(row + i).height = 24;
    }
  }
  if (tableRows.length === 0) {
    setCellBase(sheet, row, 6, "（内容なし）");
    setCellBase(sheet, row, 7, "");
    setCellBase(sheet, row, 8, "");
  } else {
    tableRows.forEach((r, ri) => {
      setCellBase(sheet, row + ri, 6, r[0] ?? "");
      setCellBase(sheet, row + ri, 7, r[1] ?? "");
      setCellBase(sheet, row + ri, 8, r[2] ?? "");
    });
  }
  return row + bodyHeight + SECTION_GAP;
}

function writeSitemap(sheet: WorksheetLike, root: SitemapNode, rowStart: number): number {
  setCellBase(sheet, rowStart, 1, "階層", { bold: true, fillHeader: true, center: true });
  setCellBase(sheet, rowStart, 2, "パス（labels）", { bold: true, fillHeader: true });
  setCellBase(sheet, rowStart, 3, "画面名", { bold: true, fillHeader: true });
  const rows = flattenSitemapRows(root);
  let row = rowStart + 1;
  rows.forEach((r) => {
    setCellBase(sheet, row, 1, String(r.level), { center: true });
    setCellBase(sheet, row, 2, `${"  ".repeat(Math.max(0, r.level - 1))}${r.path || "(無題)"}`);
    setCellBase(sheet, row, 3, r.screenName);
    row += 1;
  });
  if (rows.length === 0) {
    setCellBase(sheet, row, 1, "1", { center: true });
    setCellBase(sheet, row, 2, "(無題)");
    setCellBase(sheet, row, 3, "");
    row += 1;
  }
  return row + SECTION_GAP;
}

export async function downloadRequirementsPreviewExcel(
  body: RequirementsDocBody,
  projectName: string,
): Promise<void> {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = "ALRfy Project Manager";
  const usedSheetNames = new Set<string>();
  const visiblePages = body.pages.filter((p) => !p.deleted);
  const targetPages = visiblePages;

  if (targetPages.length === 0) {
    throw new Error("出力対象ページがありません。");
  }

  targetPages.forEach((page, index) => {
    const sheetName = uniqueSheetName(page.title || page.pageType || `ページ${index + 1}`, usedSheetNames, `Page${index + 1}`);
    const sheet = workbook.addWorksheet(sheetName, {
      views: [{ state: "frozen", ySplit: 3 }],
    });
    sheet.columns = [{ width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }];
    let row = writePageHeader(sheet, page);
    if (page.inputMode === "richtext") {
      row = writeRichtext(sheet, page.content.doc, row);
    } else if (page.inputMode === "table") {
      row = writeTable(sheet, page.content, row);
    } else if (page.inputMode === "split_editor_table") {
      row = writeSplit(sheet, page.content, row);
    } else {
      row = writeSitemap(sheet, page.content.root, row);
    }
    void row;
  });

  const fileName = `${requirementsExportBaseName(projectName)}.xlsx`;
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
