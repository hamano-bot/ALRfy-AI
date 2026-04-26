import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const UPSTREAM_PATH = "/portal/api/estimate-suggestions";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function GET(request: NextRequest) {
  const rawBase = process.env.PORTAL_API_BASE_URL;
  if (!rawBase || rawBase.trim() === "") {
    return NextResponse.json({ success: false, code: "missing_config", message: "PORTAL_API_BASE_URL が未設定です。" }, { status: 503 });
  }
  const cookie = request.headers.get("cookie");
  const url = `${trimTrailingSlashes(rawBase.trim())}${UPSTREAM_PATH}${request.nextUrl.search}`;
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
