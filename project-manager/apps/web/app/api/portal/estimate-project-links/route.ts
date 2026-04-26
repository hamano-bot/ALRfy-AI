import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const UPSTREAM_PATH = "/portal/api/estimate-project-links";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

async function proxy(request: NextRequest, method: "GET" | "PATCH", body?: string) {
  const rawBase = process.env.PORTAL_API_BASE_URL;
  if (!rawBase || rawBase.trim() === "") {
    return NextResponse.json({ success: false, code: "missing_config", message: "PORTAL_API_BASE_URL が未設定です。" }, { status: 503 });
  }
  const query = request.nextUrl.search ? request.nextUrl.search : "";
  const url = `${trimTrailingSlashes(rawBase.trim())}${UPSTREAM_PATH}${query}`;
  const cookie = request.headers.get("cookie");
  try {
    const upstream = await fetch(url, {
      method,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(method === "PATCH" ? { "Content-Type": "application/json; charset=utf-8" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body } : {}),
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

export async function GET(request: NextRequest) {
  return proxy(request, "GET");
}

export async function PATCH(request: NextRequest) {
  const json = await request.json().catch(() => null);
  if (!json) {
    return NextResponse.json({ success: false, message: "JSON ボディが不正です。" }, { status: 400 });
  }
  return proxy(request, "PATCH", JSON.stringify(json));
}
