/**
 * 見積 Excel / PDF のベース名（拡張子なし）。
 * - 旧番号 `見積_{YYYYMMDD}_{略称}_{####}` … 中段を現在の略称で置換（PHP 帳票と同じ）。
 * - 新番号 `見積_{略称}_{####}` … ファイル名は `見積_{発行日YYYYMMDD}_{略称}_{####}`（issue_date 利用）。
 */

function sanitizeEstimateFilenameSegment(s: string): string {
  return s
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/\u00A0/g, "_")
    .trim();
}

function issueDateToYmd(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[1]}${m[2]}${m[3]}` : "";
}

export function buildEstimateExportBasename(estimate: Record<string, unknown>, estimateId: number): string {
  const raw = typeof estimate.estimate_number === "string" ? estimate.estimate_number.trim() : "";
  const stripped = raw.replace(/^見積_/u, "");
  const abbrRaw = typeof estimate.client_abbr === "string" ? estimate.client_abbr.trim() : "";
  const abbrSeg = abbrRaw !== "" ? sanitizeEstimateFilenameSegment(abbrRaw) : "CLIENT";
  const legacy = /^(\d{8})_[^_]+_(\d{4})$/u.exec(stripped);
  if (legacy) {
    return `見積_${legacy[1]}_${abbrSeg}_${legacy[2]}`;
  }
  const compact = /^(.+)_(\d{4})$/u.exec(stripped);
  if (compact && !/^\d{8}_/u.test(stripped)) {
    const ymd = issueDateToYmd(estimate.issue_date);
    if (ymd !== "") {
      return `見積_${ymd}_${abbrSeg}_${compact[2]}`;
    }
    return `見積_${sanitizeEstimateFilenameSegment(compact[1])}_${compact[2]}`;
  }
  if (stripped !== "") {
    return sanitizeEstimateFilenameSegment(stripped);
  }
  return `estimate-${estimateId}`;
}
