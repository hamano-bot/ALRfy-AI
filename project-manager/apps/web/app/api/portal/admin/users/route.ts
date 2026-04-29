import { type NextRequest, NextResponse } from "next/server";
import { resolvePhpUpstream } from "@/lib/php-upstream";

export const dynamic = "force-dynamic";
const UPSTREAM_PATH = "/portal/api/admin-users";
const UPSTREAM_FALLBACK_PATH = "/portal/api/get_admin_users.php";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function GET(request: NextRequest) {
  const cookie = request.headers.get("cookie");
  try {
    const bases = Array.from(new Set([trimTrailingSlashes(resolvePhpUpstream()), "http://127.0.0.1:8000"]));
    const doFetch = (targetUrl: string) =>
      fetch(targetUrl, {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      });
    let lastPreview = "";
    for (const base of bases) {
      const url = `${base}${UPSTREAM_PATH}`;
      const fallbackUrl = `${base}${UPSTREAM_FALLBACK_PATH}`;
      let upstream = await doFetch(url);
      if (upstream.status === 404 || upstream.status === 405) {
        upstream = await doFetch(fallbackUrl);
      }
      const text = await upstream.text();
      try {
        JSON.parse(text);
        return new NextResponse(text, {
          status: upstream.status,
          headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8", "Cache-Control": "no-store" },
        });
      } catch {
        lastPreview = text.slice(0, 120);
      }
    }
    if (lastPreview === "") {
      return NextResponse.json(
        { success: false, code: "upstream_invalid_json", message: "ユーザー一覧 API の応答が不正(JSON以外)です。" },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { success: false, code: "upstream_invalid_json", message: `ユーザー一覧 API の応答が不正(JSON以外)です。${lastPreview}` },
      { status: 502 },
    );
  } catch {
    return NextResponse.json({ success: false, code: "upstream_unreachable", message: "ポータル API に接続できませんでした。" }, { status: 502 });
  }
}
