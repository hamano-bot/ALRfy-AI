import { type NextRequest, NextResponse } from "next/server";
import { resolvePhpUpstream } from "@/lib/php-upstream";

export const dynamic = "force-dynamic";
const UPSTREAM_PATH = "/portal/api/estimate-suggestions";

export async function GET(request: NextRequest) {
  const configured =
    (process.env.PORTAL_API_INTERNAL_URL && process.env.PORTAL_API_INTERNAL_URL.trim() !== "") ||
    (process.env.PORTAL_API_BASE_URL && process.env.PORTAL_API_BASE_URL.trim() !== "");
  if (!configured) {
    return NextResponse.json(
      { success: false, code: "missing_config", message: "PORTAL_API_BASE_URL（または PORTAL_API_INTERNAL_URL）が未設定です。" },
      { status: 503 },
    );
  }
  const cookie = request.headers.get("cookie");
  const url = `${resolvePhpUpstream()}${UPSTREAM_PATH}${request.nextUrl.search}`;
  try {
    const upstream = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ success: false, code: "upstream_unreachable", message: "ポータル API に接続できませんでした。" }, { status: 502 });
  }
}
