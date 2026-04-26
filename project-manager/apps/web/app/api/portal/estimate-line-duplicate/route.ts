import { type NextRequest, NextResponse } from "next/server";
import { estimateLineDuplicateSchema } from "@/lib/portal-estimate";

export const dynamic = "force-dynamic";
const UPSTREAM_PATH = "/portal/api/estimate-line-duplicate";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "JSON ボディが不正です。" }, { status: 400 });
  }
  const parsed = estimateLineDuplicateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: parsed.error.issues[0]?.message ?? "リクエストが不正です。" }, { status: 400 });
  }
  const rawBase = process.env.PORTAL_API_BASE_URL;
  if (!rawBase || rawBase.trim() === "") {
    return NextResponse.json({ success: false, code: "missing_config", message: "PORTAL_API_BASE_URL が未設定です。" }, { status: 503 });
  }
  const cookie = request.headers.get("cookie");
  const url = `${trimTrailingSlashes(rawBase.trim())}${UPSTREAM_PATH}`;
  try {
    const upstream = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json; charset=utf-8",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(parsed.data),
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
