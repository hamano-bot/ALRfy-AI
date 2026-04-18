/**
 * BFF が PHP に接続するときと、ブラウザ向けプロキシ（/login 等）が同じ upstream を指す。
 * ブラウザは http://dev-alrfy-ai.com:8001 のみ使い、PHP はこの URL 経由で到達（127.0.0.1 はサーバー内のみ）。
 */
export function resolvePhpUpstream(): string {
  const raw =
    process.env.PORTAL_API_INTERNAL_URL?.trim() ||
    process.env.PORTAL_API_BASE_URL?.trim() ||
    "http://127.0.0.1:8000";
  return raw.replace(/\/+$/, "");
}
