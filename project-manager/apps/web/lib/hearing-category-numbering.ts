import type { HearingSheetRow } from "@/lib/hearing-sheet-types";

const LEADING_TWO_DIGITS = /^(\d{2})/;

/** 分類文字列先頭の 2 桁番号（01–99）を取り出す。無ければ null */
export function parseLeadingTwoDigitFromCategory(category: string): number | null {
  const t = category.trim();
  const m = LEADING_TWO_DIGITS.exec(t);
  if (!m) {
    return null;
  }
  const n = Number.parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 1 || n > 99) {
    return null;
  }
  return n;
}

/** 既存の分類列から占有している 01–99 の番号を集める */
export function collectUsedTwoDigitNumbers(categories: string[]): Set<number> {
  const used = new Set<number>();
  for (const c of categories) {
    const n = parseLeadingTwoDigitFromCategory(c);
    if (n !== null) {
      used.add(n);
    }
  }
  return used;
}

/** Gemini が誤って付けた先頭2桁を除いたラベル */
export function stripAccidentalLeadingTwoDigits(label: string): string {
  let t = label.trim();
  const m = LEADING_TWO_DIGITS.exec(t);
  if (m) {
    t = t.slice(2).trimStart();
  }
  return t;
}

function formatTwoDigits(n: number): string {
  return n < 10 ? `0${n}` : String(Math.min(99, n));
}

/**
 * 連番（2桁）＋ラベル。ラベル先頭の誤った数字は除去済み想定。
 */
export function formatIndexedCategory(orderNumber: number, labelPart: string): string {
  const clean = stripAccidentalLeadingTwoDigits(labelPart);
  const body = clean === "" ? "分類" : clean;
  return `${formatTwoDigits(orderNumber)}${body}`;
}

/**
 * 「すべての行」× 連番: 表の順で 01 から振り直す。
 */
export function applyIndexedAllRows(
  rows: HearingSheetRow[],
  idToLabel: Map<string, string>,
): HearingSheetRow[] {
  let seq = 1;
  return rows.map((r) => {
    const raw = idToLabel.get(r.id);
    if (raw === undefined) {
      return r;
    }
    const cat = formatIndexedCategory(seq, raw);
    seq += 1;
    return { ...r, category: cat };
  });
}

/**
 * 「空欄のみ」× 連番: 更新しない行の分類から占有番号を集め、空欄行に空いている番号を割り当て（表の上から順）。
 */
export function applyIndexedEmptyOnlyRows(
  rows: HearingSheetRow[],
  targetIds: Set<string>,
  idToLabel: Map<string, string>,
): HearingSheetRow[] {
  const used = collectUsedTwoDigitNumbers(
    rows.filter((r) => !targetIds.has(r.id)).map((r) => r.category),
  );

  function takeNextNumber(): number {
    for (let n = 1; n <= 99; n += 1) {
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
    return 99;
  }

  return rows.map((r) => {
    if (!targetIds.has(r.id)) {
      return r;
    }
    const raw = idToLabel.get(r.id);
    if (raw === undefined) {
      return r;
    }
    const n = takeNextNumber();
    return { ...r, category: formatIndexedCategory(n, raw) };
  });
}

/**
 * 分類名のみ（連番なし）: 対象 id のみ上書き。
 */
export function applyLabelOnly(
  rows: HearingSheetRow[],
  targetIds: Set<string>,
  idToLabel: Map<string, string>,
): HearingSheetRow[] {
  return rows.map((r) => {
    if (!targetIds.has(r.id)) {
      return r;
    }
    const raw = idToLabel.get(r.id);
    if (raw === undefined) {
      return r;
    }
    const clean = stripAccidentalLeadingTwoDigits(raw);
    return { ...r, category: clean === "" ? r.category : clean };
  });
}

export type AutoCategoryTargetMode = "all" | "empty_only";
export type AutoCategoryStyleMode = "indexed" | "label_only";

export function selectRowsForAutoCategoryApi(rows: HearingSheetRow[], target: AutoCategoryTargetMode): HearingSheetRow[] {
  if (target === "all") {
    return rows;
  }
  return rows.filter((r) => r.category.trim() === "");
}

function buildLabelMap(labels: { id: string; label: string }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const { id, label } of labels) {
    m.set(id, label);
  }
  return m;
}

/** Gemini の返却とモードに応じて分類列を組み立て（プレビュー／反映で共通） */
export function applyAutoCategoryToRows(
  rows: HearingSheetRow[],
  params: {
    target: AutoCategoryTargetMode;
    style: AutoCategoryStyleMode;
    labels: { id: string; label: string }[];
  },
): HearingSheetRow[] {
  const map = buildLabelMap(params.labels);
  if (params.target === "all") {
    if (params.style === "indexed") {
      return applyIndexedAllRows(rows, map);
    }
    return rows.map((r) => {
      const v = map.get(r.id);
      if (v === undefined) {
        return r;
      }
      const clean = stripAccidentalLeadingTwoDigits(v);
      return { ...r, category: clean === "" ? r.category : clean };
    });
  }
  const emptyIds = new Set(rows.filter((r) => r.category.trim() === "").map((r) => r.id));
  if (params.style === "indexed") {
    return applyIndexedEmptyOnlyRows(rows, emptyIds, map);
  }
  return applyLabelOnly(rows, emptyIds, map);
}
