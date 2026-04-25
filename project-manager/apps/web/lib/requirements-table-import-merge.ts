import type { RequirementsPageContentTable, RequirementsTableRow } from "@/lib/requirements-doc-types";

export type RequirementsTableMergeMode = "replace" | "append";

function normCell(s: string): string {
  return s.trim();
}

function rowKey(cells: string[]): string {
  return cells.map(normCell).join("\u241f");
}

function newRowId(prefix: string): string {
  return typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function"
    ? `${prefix}-${globalThis.crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function clampToSix(content: RequirementsPageContentTable): RequirementsPageContentTable {
  const labels = (content.columnLabels.length > 0 ? content.columnLabels : ["項目", "内容", "備考"]).slice(0, 6);
  const width = labels.length;
  const rows = content.rows.map((row, idx) => ({
    id: row.id?.trim() ? row.id : newRowId(`imp-${idx}`),
    cells: Array.from({ length: width }, (_, ci) => (typeof row.cells[ci] === "string" ? row.cells[ci] : "")),
  }));
  return { columnLabels: labels, rows };
}

export function mergeRequirementsTableImport(
  current: RequirementsPageContentTable,
  imported: RequirementsPageContentTable,
  mode: RequirementsTableMergeMode,
): RequirementsPageContentTable {
  const sanitizedImported = clampToSix(imported);
  if (mode === "replace") {
    return sanitizedImported;
  }
  const width = current.columnLabels.length;
  const normalizedCurrent: RequirementsPageContentTable = {
    columnLabels: current.columnLabels,
    rows: current.rows.map((row) => ({
      ...row,
      cells: Array.from({ length: width }, (_, ci) => (typeof row.cells[ci] === "string" ? row.cells[ci] : "")),
    })),
  };
  const keys = new Set(normalizedCurrent.rows.map((row) => rowKey(row.cells)));
  const extras: RequirementsTableRow[] = [];
  for (const row of sanitizedImported.rows) {
    const normalizedCells = Array.from({ length: width }, (_, ci) => row.cells[ci] ?? "");
    const key = rowKey(normalizedCells);
    if (keys.has(key)) {
      continue;
    }
    keys.add(key);
    extras.push({
      id: row.id?.trim() ? row.id : newRowId("append"),
      cells: normalizedCells,
    });
  }
  return { columnLabels: normalizedCurrent.columnLabels, rows: [...normalizedCurrent.rows, ...extras] };
}
