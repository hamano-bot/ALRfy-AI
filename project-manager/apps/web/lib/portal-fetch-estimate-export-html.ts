/**
 * サーバー専用: ポータルから見積 HTML エクスポート JSON を取得する。
 */

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export type PortalEstimateHtmlResult =
  | { ok: true; html: string }
  | { ok: false; status: number; message: string };

const PRIMARY = "/portal/api/estimate-export-html";
const FALLBACK = "/portal/api/post_estimate_export_html.php";
const TIMEOUT_MS = 30_000;

export async function fetchPortalEstimateExportHtml(
  portalBaseUrl: string,
  cookie: string | null,
  estimateId: number,
): Promise<PortalEstimateHtmlResult> {
  const base = trimTrailingSlashes(portalBaseUrl.trim());
  const primaryUrl = `${base}${PRIMARY}`;
  const fallbackUrl = `${base}${FALLBACK}`;
  const body = JSON.stringify({ estimate_id: estimateId });
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json; charset=utf-8",
  };
  if (cookie) headers.Cookie = cookie;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const doFetch = async (url: string) =>
      fetch(url, {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers,
        body,
      });

    let upstream = await doFetch(primaryUrl);
    if (upstream.status === 404 || upstream.status === 405) {
      upstream = await doFetch(fallbackUrl);
    }
    const text = await upstream.text();
    let data: { success?: boolean; html?: string; message?: string };
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      return { ok: false, status: upstream.status, message: "HTML APIの応答が不正です。" };
    }
    if (!upstream.ok || !data.success || !data.html) {
      return {
        ok: false,
        status: upstream.status,
        message: data.message ?? "帳票HTMLの取得に失敗しました。",
      };
    }
    return { ok: true, html: data.html };
  } catch {
    return { ok: false, status: 502, message: "ポータル API に接続できませんでした。" };
  } finally {
    clearTimeout(t);
  }
}
