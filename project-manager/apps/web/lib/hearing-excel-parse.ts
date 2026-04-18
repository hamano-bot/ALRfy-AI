import * as XLSX from "xlsx";

/** 先頭シートを TSV 風テキストに（Gemini 入力用） */
export function excelBufferToSheetText(buffer: ArrayBuffer): { text: string; sheetName: string } {
  const wb = XLSX.read(buffer, { type: "array" });
  if (!wb.SheetNames.length) {
    return { text: "", sheetName: "" };
  }
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    return { text: "", sheetName };
  }
  const text = XLSX.utils.sheet_to_csv(sheet, { FS: "\t", RS: "\n" });
  return { text, sheetName };
}

/** Gemini の入力上限に合わせて切り詰め（文字数） */
export function truncateSheetText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, maxChars), truncated: true };
}
