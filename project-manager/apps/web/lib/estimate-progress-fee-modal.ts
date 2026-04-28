import { computeEstimateLineAmount } from "@/lib/portal-estimate";

/** 進行管理費モーダル用の大項目ブロック（親1行＋子明細の global index） */
export type EstimateMajorBlockForProgressFee = {
  majorLineIndex: number;
  majorHeading: string;
  detailLineIndices: number[];
};

export type EstimateLineLike = {
  item_code?: string | null;
  item_name: string;
  major_category?: string | null;
  quantity: number | null;
  unit_price: number | null;
  factor: number;
  unit_type: string;
};

/** NFKC + 小文字化（SITEMANAGE 表記ゆれ判定用） */
export function normalizeHeadingForSiteManageMatch(raw: string): string {
  const t = raw.trim();
  try {
    return t.normalize("NFKC").toLowerCase();
  } catch {
    return t.toLowerCase();
  }
}

export function majorHeadingHidesSiteManageBlock(heading: string): boolean {
  return normalizeHeadingForSiteManageMatch(heading).includes("sitemanage");
}

export function majorHeadingLabelForLine(line: Pick<EstimateLineLike, "major_category" | "item_name">): string {
  const m = String(line.major_category ?? "").trim();
  const n = String(line.item_name ?? "").trim();
  return m !== "" ? m : n;
}

/**
 * 大項目行で区切ったブロック一覧。見出しに SITEMANAGE を含むブロックは含めない。
 * 先頭に親無し明細があればスキップ（モーダル対象外）。
 */
export function segmentVisibleMajorBlocksForProgressFee(
  lines: EstimateLineLike[],
  isMajorHeadingLine: (line: EstimateLineLike) => boolean,
): EstimateMajorBlockForProgressFee[] {
  const blocks: EstimateMajorBlockForProgressFee[] = [];
  let i = 0;
  const n = lines.length;
  while (i < n) {
    const row = lines[i];
    if (!row) {
      i++;
      continue;
    }
    if (!isMajorHeadingLine(row)) {
      i++;
      continue;
    }
    const majorHeading = majorHeadingLabelForLine(row);
    const majorLineIndex = i;
    i++;
    const detailLineIndices: number[] = [];
    while (i < n) {
      const next = lines[i];
      if (!next) break;
      if (isMajorHeadingLine(next)) break;
      detailLineIndices.push(i);
      i++;
    }
    if (!majorHeadingHidesSiteManageBlock(majorHeading)) {
      blocks.push({ majorLineIndex, majorHeading, detailLineIndices });
    }
  }
  return blocks;
}

export function sumCheckedDetailLineAmounts(
  lines: EstimateLineLike[],
  checkedGlobalIndices: ReadonlySet<number>,
  isMajorHeadingLine: (line: EstimateLineLike) => boolean,
): number {
  let sum = 0;
  for (const idx of checkedGlobalIndices) {
    const line = lines[idx];
    if (!line || isMajorHeadingLine(line)) continue;
    sum += computeEstimateLineAmount({
      quantity: line.quantity ?? 0,
      unit_price: line.unit_price ?? 0,
      factor: line.factor,
      unit_type: line.unit_type,
    });
  }
  return sum;
}

export function findOtherMajorBlock(
  blocks: EstimateMajorBlockForProgressFee[],
  isOtherHeading: (h: string) => boolean,
): EstimateMajorBlockForProgressFee | undefined {
  return blocks.find((b) => isOtherHeading(b.majorHeading));
}
