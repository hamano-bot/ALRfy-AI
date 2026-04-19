import type { HearingSheetRow } from "@/lib/hearing-sheet-types";

export type HearingMergeMode = "replace" | "fill_empty" | "append";

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** 行の同一・照合に使うキー（分類は含めない）。見出し＋確認事項を正規化して連結。 */
export function hearingRowMatchKey(r: HearingSheetRow): string {
  return `${norm(r.heading)}|${norm(r.question)}`;
}

function isBlankRowForImport(r: HearingSheetRow): boolean {
  return r.heading.trim() === "" && r.question.trim() === "";
}

function newId(prefix: string): string {
  return typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function"
    ? `${prefix}-${globalThis.crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 取り込んだ行を現在の表にマージする。
 * 同一判定・照合は **見出し＋確認事項**（正規化後の組）のみ。分類は判定に使わない。
 *
 * - replace: 取り込みをそのまま採用（id は維持・欠ける場合は付与）
 * - fill_empty: 見出し＋確認事項が一致する行同士で、空のセルのみ取り込みで上書き。一致しない取り込み行は末尾に追加。
 * - append: 見出し＋確認事項の組が現状に無い行だけ追加
 */
export function mergeHearingItems(
  current: HearingSheetRow[],
  imported: HearingSheetRow[],
  mode: HearingMergeMode,
): HearingSheetRow[] {
  if (mode === "replace") {
    return imported.map((r, i) => ({
      ...r,
      id: r.id && r.id.trim() !== "" ? r.id : newId(`imp-${i}`),
    }));
  }

  if (mode === "append") {
    const keys = new Set(current.map((r) => hearingRowMatchKey(r)));
    const extra: HearingSheetRow[] = [];
    for (const r of imported) {
      if (isBlankRowForImport(r)) {
        continue;
      }
      const k = hearingRowMatchKey(r);
      if (keys.has(k)) {
        continue;
      }
      keys.add(k);
      extra.push({
        ...r,
        id: r.id && r.id.trim() !== "" ? r.id : newId("add"),
      });
    }
    return [...current.map((r) => ({ ...r })), ...extra];
  }

  // fill_empty
  const result = current.map((r) => ({ ...r }));

  const byMatchKey = new Map<string, HearingSheetRow[]>();
  for (const r of imported) {
    if (isBlankRowForImport(r)) {
      continue;
    }
    const k = hearingRowMatchKey(r);
    const list = byMatchKey.get(k) ?? [];
    list.push(r);
    byMatchKey.set(k, list);
  }

  for (let i = 0; i < result.length; i++) {
    const r = result[i];
    if (isBlankRowForImport(r)) {
      continue;
    }
    const k = hearingRowMatchKey(r);
    const candidates = byMatchKey.get(k);
    const imp = candidates?.[0];
    if (!imp) {
      continue;
    }
    if (!r.answer.trim()) {
      r.answer = imp.answer;
    }
    if (!r.question.trim()) {
      r.question = imp.question;
    }
    if (!r.category.trim()) {
      r.category = imp.category;
    }
    if (!r.heading.trim()) {
      r.heading = imp.heading;
    }
    if (!r.assignee.trim()) {
      r.assignee = imp.assignee;
    }
    if (!r.due.trim()) {
      r.due = imp.due;
    }
    if (!r.row_status.trim()) {
      r.row_status = imp.row_status;
    }
  }

  const keys = new Set(result.map((row) => hearingRowMatchKey(row)));
  for (const imp of imported) {
    if (isBlankRowForImport(imp)) {
      continue;
    }
    const k = hearingRowMatchKey(imp);
    if (keys.has(k)) {
      continue;
    }
    keys.add(k);
    result.push({
      ...imp,
      id: imp.id && imp.id.trim() !== "" ? imp.id : newId("fill"),
    });
  }

  return result;
}

const PREVIEW_DIFF_FIELDS: (keyof HearingSheetRow)[] = [
  "category",
  "heading",
  "question",
  "answer",
  "assignee",
  "due",
  "row_status",
];

function compareRowContent(a: HearingSheetRow, b: HearingSheetRow): (keyof HearingSheetRow)[] {
  const changed: (keyof HearingSheetRow)[] = [];
  for (const f of PREVIEW_DIFF_FIELDS) {
    if (String(a[f]).trim() !== String(b[f]).trim()) {
      changed.push(f);
    }
  }
  return changed;
}

/** プレビュー表用: マージ後の各行が新規か、既存キーに対してどの列が変わるか */
export type HearingPreviewRowDiff = {
  row: HearingSheetRow;
  /** すべて置換モードでは常に true（行は取り込み由来のため） */
  isNew: boolean;
  changedFields: (keyof HearingSheetRow)[];
};

export function diffPreviewRows(
  current: HearingSheetRow[],
  merged: HearingSheetRow[],
  mode: HearingMergeMode,
): HearingPreviewRowDiff[] {
  if (mode === "replace") {
    return merged.map((row) => ({
      row,
      isNew: true,
      changedFields: [] as (keyof HearingSheetRow)[],
    }));
  }

  const byKey = new Map<string, HearingSheetRow>();
  for (const r of current) {
    byKey.set(hearingRowMatchKey(r), r);
  }

  return merged.map((row) => {
    const k = hearingRowMatchKey(row);
    const prev = byKey.get(k);
    if (!prev) {
      return { row, isNew: true, changedFields: [] as (keyof HearingSheetRow)[] };
    }
    return {
      row,
      isNew: false,
      changedFields: compareRowContent(prev, row),
    };
  });
}

/** マージ前後の差分（簡易・行単位） */
export function diffHearingRows(before: HearingSheetRow[], after: HearingSheetRow[]): {
  rowCountBefore: number;
  rowCountAfter: number;
  changed: boolean;
} {
  const changed = JSON.stringify(before) !== JSON.stringify(after);
  return {
    rowCountBefore: before.length,
    rowCountAfter: after.length,
    changed,
  };
}
