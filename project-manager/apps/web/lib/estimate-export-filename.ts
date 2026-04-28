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

function datetimeToYmd(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(s);
  return m ? `${m[1]}${m[2]}${m[3]}` : "";
}

function todayYmdInJst(now: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now).replaceAll("-", "");
}

function preferredEstimateAbbr(estimate: Record<string, unknown>, fallback: string): string {
  const abbrRaw = typeof estimate.client_abbr === "string" ? estimate.client_abbr.trim() : "";
  if (abbrRaw !== "") {
    return sanitizeEstimateFilenameSegment(abbrRaw);
  }
  return sanitizeEstimateFilenameSegment(fallback);
}

function extractEstimateSerial(estimate: Record<string, unknown>, estimateId: number): { abbr: string; seq: string } {
  const raw = typeof estimate.estimate_number === "string" ? estimate.estimate_number.trim() : "";
  const stripped = raw.replace(/^見積_/u, "");
  const abbrFallback = preferredEstimateAbbr(estimate, "CLIENT");
  const mDateAbbrSeq = /^(\d{8})_([^_]+)_(\d{3,4})$/u.exec(stripped);
  if (mDateAbbrSeq) {
    return { abbr: preferredEstimateAbbr(estimate, mDateAbbrSeq[2]), seq: mDateAbbrSeq[3] };
  }
  const mAbbrSeq = /^([^_]+)_(\d{3,4})$/u.exec(stripped);
  if (mAbbrSeq) {
    return { abbr: preferredEstimateAbbr(estimate, mAbbrSeq[1]), seq: mAbbrSeq[2] };
  }
  return { abbr: abbrFallback, seq: String(estimateId).padStart(3, "0") };
}

export function buildEstimateExportBasename(estimate: Record<string, unknown>, estimateId: number): string {
  const raw = typeof estimate.estimate_number === "string" ? estimate.estimate_number.trim() : "";
  const stripped = raw.replace(/^見積_/u, "");
  const abbrSeg = preferredEstimateAbbr(estimate, "CLIENT");
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

/**
 * PDF 出力用ファイル名（拡張子なし）
 * 形式: 見積_{見積作成日}{略称}{連番}_{件名}_{出力日YYYYMMDD}
 */
export function buildEstimatePdfExportBasename(
  estimate: Record<string, unknown>,
  estimateId: number,
  now: Date = new Date(),
): string {
  const createdYmd =
    datetimeToYmd(estimate.created_at) || issueDateToYmd(estimate.issue_date) || todayYmdInJst(now);
  const { abbr, seq } = extractEstimateSerial(estimate, estimateId);
  const subjectRaw = typeof estimate.title === "string" ? estimate.title.trim() : "";
  const subject = subjectRaw !== "" ? sanitizeEstimateFilenameSegment(subjectRaw) : "件名未設定";
  const exportedAtYmd = todayYmdInJst(now);
  return `見積_${createdYmd}${abbr}${seq}_${subject}_${exportedAtYmd}`;
}
