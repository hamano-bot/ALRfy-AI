/** 見積編集の下部合計ドック表示状態（個人情報なし・UI 嗜好のみ） */
export const ESTIMATE_TOTALS_DOCK_COOKIE_NAME = "alrfy_estimate_totals_dock";

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365;

function parseTotalsDockCookieValue(raw: string | undefined): "visible" | "hidden" {
  if (raw === "hidden") return "hidden";
  return "visible";
}

export function readEstimateTotalsDockCookie(): "visible" | "hidden" {
  if (typeof document === "undefined") return "visible";
  const parts = document.cookie.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(`${ESTIMATE_TOTALS_DOCK_COOKIE_NAME}=`)) {
      const v = p.slice(ESTIMATE_TOTALS_DOCK_COOKIE_NAME.length + 1);
      return parseTotalsDockCookieValue(decodeURIComponent(v));
    }
  }
  return "visible";
}

export function writeEstimateTotalsDockCookie(visibility: "visible" | "hidden"): void {
  if (typeof document === "undefined") return;
  const enc = encodeURIComponent(visibility);
  document.cookie = `${ESTIMATE_TOTALS_DOCK_COOKIE_NAME}=${enc}; Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax`;
}
