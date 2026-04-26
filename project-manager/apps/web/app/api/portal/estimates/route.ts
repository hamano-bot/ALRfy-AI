import { type NextRequest, NextResponse } from "next/server";
import { estimateUpsertSchema } from "@/lib/portal-estimate";

export const dynamic = "force-dynamic";

const UPSTREAM_PATH = "/portal/api/estimates";
const UPSTREAM_FALLBACK_PATH = "/portal/api/get_post_patch_delete_estimates.php";
const UPSTREAM_TIMEOUT_MS = 30_000;

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

async function proxy(request: NextRequest, method: "GET" | "POST" | "PATCH" | "DELETE", body?: string) {
  const rawBase = process.env.PORTAL_API_BASE_URL;
  if (!rawBase || rawBase.trim() === "") {
    return NextResponse.json(
      { success: false, code: "missing_config", message: "PORTAL_API_BASE_URL が未設定のためポータル API に接続できません。" },
      { status: 503 },
    );
  }
  const base = trimTrailingSlashes(rawBase.trim());
  const query = request.nextUrl.search ? request.nextUrl.search : "";
  const primaryUrl = `${base}${UPSTREAM_PATH}${query}`;
  const fallbackUrl = `${base}${UPSTREAM_FALLBACK_PATH}${query}`;
  const cookie = request.headers.get("cookie");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const doFetch = async (url: string) =>
      fetch(url, {
        method,
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(method !== "GET" && method !== "DELETE" ? { "Content-Type": "application/json; charset=utf-8" } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body !== undefined ? { body } : {}),
      });

    let upstream = await doFetch(primaryUrl);
    // 拡張子なしルートが未配線の 404 のほか、PATCH 等が許可されていない 405 のときも .php にフォールバックする
    if (upstream.status === 404 || upstream.status === 405) {
      upstream = await doFetch(fallbackUrl);
    }
    const contentType = upstream.headers.get("content-type") ?? "application/json; charset=utf-8";
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": contentType, "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { success: false, code: "upstream_unreachable", message: "ポータル API に接続できませんでした。" },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
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
  const parsed = estimateUpsertSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: parsed.error.issues[0]?.message ?? "リクエストの形式が不正です。" }, { status: 400 });
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
  const parsed = estimateUpsertSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: parsed.error.issues[0]?.message ?? "リクエストの形式が不正です。" }, { status: 400 });
  }
  return proxy(request, "PATCH", JSON.stringify(parsed.data));
}

export async function DELETE(request: NextRequest) {
  return proxy(request, "DELETE");
}
