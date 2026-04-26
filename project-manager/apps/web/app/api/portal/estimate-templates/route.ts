import { type NextRequest, NextResponse } from "next/server";
import { estimateTemplatePatchSchema, estimateTemplatePostSchema } from "@/lib/portal-estimate";

export const dynamic = "force-dynamic";
const UPSTREAM_PATH = "/portal/api/estimate-templates";
/** 拡張子なしルートが未配線の環境向け（`estimates` Route と同様） */
const UPSTREAM_FALLBACK_PATH = "/portal/api/get_post_patch_delete_estimate_templates.php";
const UPSTREAM_TIMEOUT_MS = 30_000;

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

async function proxy(request: NextRequest, method: "GET" | "POST" | "PATCH" | "DELETE", body?: string) {
  const rawBase = process.env.PORTAL_API_BASE_URL;
  if (!rawBase || rawBase.trim() === "") {
    return NextResponse.json({ success: false, code: "missing_config", message: "PORTAL_API_BASE_URL が未設定です。" }, { status: 503 });
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
    return NextResponse.json({ success: false, code: "upstream_unreachable", message: "ポータル API に接続できませんでした。" }, { status: 502 });
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
  const parsed = estimateTemplatePostSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: parsed.error.issues[0]?.message ?? "リクエストが不正です。" }, { status: 400 });
  }
  let body: string;
  try {
    body = JSON.stringify(parsed.data);
  } catch {
    return NextResponse.json(
      { success: false, message: "テンプレートデータを JSON にできません（循環参照や不正な値の可能性があります）。" },
      { status: 400 },
    );
  }
  return proxy(request, "POST", body);
}

export async function PATCH(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "JSON ボディが不正です。" }, { status: 400 });
  }
  const parsed = estimateTemplatePatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: parsed.error.issues[0]?.message ?? "リクエストが不正です。" }, { status: 400 });
  }
  let body: string;
  try {
    body = JSON.stringify(parsed.data);
  } catch {
    return NextResponse.json(
      { success: false, message: "テンプレートデータを JSON にできません（循環参照や不正な値の可能性があります）。" },
      { status: 400 },
    );
  }
  return proxy(request, "PATCH", body);
}

export async function DELETE(request: NextRequest) {
  return proxy(request, "DELETE");
}
