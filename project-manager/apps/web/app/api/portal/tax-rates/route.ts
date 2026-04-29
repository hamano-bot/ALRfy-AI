import { type NextRequest, NextResponse } from "next/server";
import { taxRatePatchSchema, taxRatePostSchema } from "@/lib/portal-estimate";
import { resolvePhpUpstream } from "@/lib/php-upstream";

export const dynamic = "force-dynamic";
const UPSTREAM_PATH = "/portal/api/tax-rates";

async function proxy(request: NextRequest, method: "GET" | "POST" | "PATCH", body?: string) {
  const configured =
    (process.env.PORTAL_API_INTERNAL_URL && process.env.PORTAL_API_INTERNAL_URL.trim() !== "") ||
    (process.env.PORTAL_API_BASE_URL && process.env.PORTAL_API_BASE_URL.trim() !== "");
  if (!configured) {
    return NextResponse.json(
      { success: false, code: "missing_config", message: "PORTAL_API_BASE_URL（または PORTAL_API_INTERNAL_URL）が未設定です。" },
      { status: 503 },
    );
  }
  const url = `${resolvePhpUpstream()}${UPSTREAM_PATH}${request.nextUrl.search}`;
  const cookie = request.headers.get("cookie");
  try {
    const upstream = await fetch(url, {
      method,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(method !== "GET" ? { "Content-Type": "application/json; charset=utf-8" } : {}),
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

export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "JSON ボディが不正です。" }, { status: 400 });
  }
  const parsed = taxRatePostSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: parsed.error.issues[0]?.message ?? "リクエストが不正です。" }, { status: 400 });
  }
  return proxy(request, "POST", JSON.stringify(parsed.data));
}

export async function PATCH(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "JSON ボディが不正です。" }, { status: 400 });
  }
  const parsed = taxRatePatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: parsed.error.issues[0]?.message ?? "リクエストが不正です。" }, { status: 400 });
  }
  return proxy(request, "PATCH", JSON.stringify(parsed.data));
}
