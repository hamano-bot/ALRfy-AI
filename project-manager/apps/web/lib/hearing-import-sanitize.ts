import type { HearingSheetRow } from "@/lib/hearing-sheet-types";

/** 状況として許容する値（空含む）。それ以外は担当へ移し状況は空にする */
const ALLOWED_ROW_STATUS = new Set(["", "確認中", "完了"]);

function normalizeRowStatus(raw: string): "" | "確認中" | "完了" | null {
  const t = raw.trim();
  if (ALLOWED_ROW_STATUS.has(t)) {
    return t as "" | "確認中" | "完了";
  }
  return null;
}

/** Excel 取り込み直後: 状況に人名等が入った行を担当へ寄せる */
export function sanitizeHearingRowsFromExcelImport(rows: HearingSheetRow[]): HearingSheetRow[] {
  return rows.map((row) => {
    const ok = normalizeRowStatus(row.row_status);
    if (ok !== null) {
      return { ...row, row_status: ok };
    }
    const misplaced = row.row_status.trim();
    if (misplaced === "") {
      return row;
    }
    const prev = row.assignee.trim();
    const assignee = prev === "" ? misplaced : `${prev} ${misplaced}`.trim();
    return { ...row, row_status: "", assignee };
  });
}
