import { type NextRequest, NextResponse } from "next/server";
import { resolvePhpUpstream } from "@/lib/php-upstream";

export const dynamic = "force-dynamic";
const UPSTREAM_PATH = "/portal/api/admin/user-team-tags/bulk";
const UPSTREAM_FALLBACK_PATH = "/portal/api/patch_admin_user_team_tags_bulk.php";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function PATCH(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "JSON ボディが不正です。" }, { status: 400 });
  }
  const configured =
    (process.env.PORTAL_API_INTERNAL_URL && process.env.PORTAL_API_INTERNAL_URL.trim() !== "") ||
    (process.env.PORTAL_API_BASE_URL && process.env.PORTAL_API_BASE_URL.trim() !== "");
  if (!configured) {
    return NextResponse.json(
      { success: false, code: "missing_config", message: "PORTAL_API_BASE_URL（または PORTAL_API_INTERNAL_URL）が未設定です。" },
      { status: 503 },
    );
  }
  const base = trimTrailingSlashes(resolvePhpUpstream());
  const url = `${base}${UPSTREAM_PATH}`;
  const fallbackUrl = `${base}${UPSTREAM_FALLBACK_PATH}`;
  const cookie = request.headers.get("cookie");
  try {
    const doFetch = (targetUrl: string) =>
      fetch(targetUrl, {
        method: "PATCH",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json; charset=utf-8",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify(json),
      });
    let upstream = await doFetch(url);
    if (upstream.status === 404 || upstream.status === 405) {
      upstream = await doFetch(fallbackUrl);
    }
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ success: false, code: "upstream_unreachable", message: "ポータル API に接続できませんでした。" }, { status: 502 });
  }
}
