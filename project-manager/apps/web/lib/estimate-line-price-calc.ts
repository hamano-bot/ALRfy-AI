import { computeEstimateLineAmount } from "@/lib/portal-estimate";

/** 明細行のうち、キーワード計算・コーディング合算に必要なフィールド（`isMajorHeadingLine` と整合） */
export type EstimateLineForPriceCalc = {
  item_code?: string | null;
  item_name: string;
  major_category?: string | null;
  quantity: number | null;
  unit_price: number | null;
  factor: number;
  unit_type: string;
};

const LIQUID_FRAGMENTS = ["リキット対応", "レリキッドレイアウト", "リキッド対応", "リキットレイアウト"] as const;
const RESP_FRAGMENTS = ["レスポンシブ対応", "レスポンシブ"] as const;
const CODING_FRAGMENT = "コーディング";

export function normalizeEstimateItemNameForKeywords(raw: string): string {
  const t = String(raw ?? "").trim();
  try {
    return t.normalize("NFKC");
  } catch {
    return t;
  }
}

/** リキッド系をレスポンシブ系より優先 */
export function getLinePriceCalcKind(itemName: string): "liquid" | "responsive" | null {
  const n = normalizeEstimateItemNameForKeywords(itemName);
  for (const f of LIQUID_FRAGMENTS) {
    if (n.includes(f)) return "liquid";
  }
  for (const f of RESP_FRAGMENTS) {
    if (n.includes(f)) return "responsive";
  }
  return null;
}

export function detailIndicesInSameMajorBlock(
  lines: EstimateLineForPriceCalc[],
  detailIndex: number,
  isMajorHeadingLine: (line: Pick<EstimateLineForPriceCalc, "item_code" | "item_name" | "major_category">) => boolean,
): number[] {
  const row = lines[detailIndex];
  if (!row || isMajorHeadingLine(row)) {
    return [];
  }

  let blockStart = 0;
  for (let i = detailIndex - 1; i >= 0; i--) {
    const line = lines[i];
    if (line && isMajorHeadingLine(line)) {
      blockStart = i + 1;
      break;
    }
  }

  let blockEnd = lines.length;
  for (let j = detailIndex + 1; j < lines.length; j++) {
    const line = lines[j];
    if (line && isMajorHeadingLine(line)) {
      blockEnd = j;
      break;
    }
  }

  const out: number[] = [];
  for (let k = blockStart; k < blockEnd; k++) {
    const line = lines[k];
    if (line && !isMajorHeadingLine(line)) {
      out.push(k);
    }
  }
  return out;
}

export function sumCodingLineAmountsInIndices(
  lines: EstimateLineForPriceCalc[],
  indices: number[],
  excludeIndex: number,
  isMajorHeadingLine: (line: Pick<EstimateLineForPriceCalc, "item_code" | "item_name" | "major_category">) => boolean,
): number {
  const needle = normalizeEstimateItemNameForKeywords(CODING_FRAGMENT);
  let sum = 0;
  for (const idx of indices) {
    if (idx === excludeIndex) continue;
    const line = lines[idx];
    if (!line) continue;
    if (isMajorHeadingLine(line)) continue;
    const name = normalizeEstimateItemNameForKeywords(line.item_name);
    if (!name.includes(needle)) continue;
    sum += computeEstimateLineAmount({
      quantity: line.quantity ?? 0,
      unit_price: line.unit_price ?? 0,
      factor: line.factor,
      unit_type: line.unit_type,
    });
  }
  return sum;
}
