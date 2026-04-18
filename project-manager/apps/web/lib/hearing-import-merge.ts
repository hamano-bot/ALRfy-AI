import type { HearingSheetRow } from "@/lib/hearing-sheet-types";

export type HearingMergeMode = "replace" | "fill_empty" | "append";

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function rowKey(r: HearingSheetRow): string {
  return `${norm(r.category)}|${norm(r.heading)}`;
}

function newId(prefix: string): string {
  return typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function"
    ? `${prefix}-${globalThis.crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 取り込んだ行を現在の表にマージする。
 * - replace: 取り込みをそのまま採用（id は維持・欠ける場合は付与）
 * - fill_empty: 見出し（+分類）一致で空欄のみ上書き。一致しない取り込み行は末尾に追加。
 * - append: 見出し+分類の組が現状に無い行だけ追加
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
    const keys = new Set(current.map((r) => rowKey(r)));
    const extra: HearingSheetRow[] = [];
    for (const r of imported) {
      const k = rowKey(r);
      if (keys.has(k)) {
        continue;
      }
      if (r.heading.trim() === "" && r.question.trim() === "") {
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
  const byHeading = new Map<string, HearingSheetRow[]>();
  for (const r of imported) {
    const h = norm(r.heading);
    if (!h) {
      continue;
    }
    const list = byHeading.get(h) ?? [];
    list.push(r);
    byHeading.set(h, list);
  }

  for (let i = 0; i < result.length; i++) {
    const r = result[i];
    const h = norm(r.heading);
    const candidates = h ? byHeading.get(h) : undefined;
    const imp =
      candidates?.find((x) => norm(x.category) === norm(r.category)) ??
      candidates?.[0] ??
      imported.find((x) => norm(x.heading) === h && (norm(x.category) === norm(r.category) || r.category.trim() === ""));
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

  const keys = new Set(result.map((k) => rowKey(k)));
  for (const imp of imported) {
    const k = rowKey(imp);
    if (keys.has(k)) {
      continue;
    }
    if (imp.heading.trim() === "" && imp.question.trim() === "") {
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
