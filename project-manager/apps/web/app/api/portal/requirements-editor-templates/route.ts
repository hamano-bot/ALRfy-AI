import { type NextRequest, NextResponse } from "next/server";
import {
  portalRequirementsTemplatePatchBodySchema,
  portalRequirementsTemplatePostBodySchema,
} from "@/lib/portal-requirements-templates";

export const dynamic = "force-dynamic";

const UPSTREAM_PATH = "/portal/api/requirements-editor-templates";
const UPSTREAM_TIMEOUT_MS = 30_000;

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function GET(request: NextRequest) {
  return proxyPortal(request, "GET", undefined);
}

export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "JSON ボディが不正です。" }, { status: 400 });
  }
  const parsed = portalRequirementsTemplatePostBodySchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.flatten().formErrors[0] ?? parsed.error.issues[0]?.message ?? "リクエストの形式が不正です。";
    return NextResponse.json({ success: false, message: first }, { status: 400 });
  }
  return proxyPortal(request, "POST", JSON.stringify(parsed.data));
}

export async function PATCH(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "JSON ボディが不正です。" }, { status: 400 });
  }
  const parsed = portalRequirementsTemplatePatchBodySchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.flatten().formErrors[0] ?? parsed.error.issues[0]?.message ?? "リクエストの形式が不正です。";
    return NextResponse.json({ success: false, message: first }, { status: 400 });
  }
  return proxyPortal(request, "PATCH", JSON.stringify(parsed.data));
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id || id.trim() === "") {
    return NextResponse.json({ success: false, message: "id をクエリで指定してください。" }, { status: 400 });
  }
  const rawBase = process.env.PORTAL_API_BASE_URL;
  if (!rawBase || rawBase.trim() === "") {
    return NextResponse.json(
      {
        success: false,
        code: "missing_config",
        message: "PORTAL_API_BASE_URL が未設定のためポータル API に接続できません。",
      },
      { status: 503 },
    );
  }
  const base = trimTrailingSlashes(rawBase.trim());
  const url = `${base}${UPSTREAM_PATH}?id=${encodeURIComponent(id.trim())}`;
  const cookie = request.headers.get("cookie");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(url, {
      method: "DELETE",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
    const contentType = upstream.headers.get("content-type") ?? "application/json; charset=utf-8";
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
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

async function proxyPortal(request: NextRequest, method: "GET" | "POST" | "PATCH", body: string | undefined) {
  const rawBase = process.env.PORTAL_API_BASE_URL;
  if (!rawBase || rawBase.trim() === "") {
    return NextResponse.json(
      {
        success: false,
        code: "missing_config",
        message: "PORTAL_API_BASE_URL が未設定のためポータル API に接続できません。",
      },
      { status: 503 },
    );
  }
  const base = trimTrailingSlashes(rawBase.trim());
  const url = `${base}${UPSTREAM_PATH}`;
  const cookie = request.headers.get("cookie");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(url, {
      method,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(method !== "GET"
          ? { "Content-Type": "application/json; charset=utf-8" }
          : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body !== undefined ? { body } : {}),
    });
    const contentType = upstream.headers.get("content-type") ?? "application/json; charset=utf-8";
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
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
