import { type NextRequest, NextResponse } from "next/server";
import { resolvePhpUpstream } from "@/lib/php-upstream";

export const dynamic = "force-dynamic";
const UPSTREAM_PATH = "/portal/api/estimate-project-links";

async function proxy(request: NextRequest, method: "GET" | "PATCH", body?: string) {
  const configured =
    (process.env.PORTAL_API_INTERNAL_URL && process.env.PORTAL_API_INTERNAL_URL.trim() !== "") ||
    (process.env.PORTAL_API_BASE_URL && process.env.PORTAL_API_BASE_URL.trim() !== "");
  if (!configured) {
    return NextResponse.json(
      { success: false, code: "missing_config", message: "PORTAL_API_BASE_URL（または PORTAL_API_INTERNAL_URL）が未設定です。" },
      { status: 503 },
    );
  }
  const query = request.nextUrl.search ? request.nextUrl.search : "";
  const url = `${resolvePhpUpstream()}${UPSTREAM_PATH}${query}`;
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
    try {
      const parsed = JSON.parse(text) as {
        success?: boolean;
        message?: string;
        links?: unknown[];
      };
      console.info("[estimate-project-links upstream]", {
        method,
        status: upstream.status,
        success: parsed.success ?? null,
        message: parsed.message ?? null,
        link_count: Array.isArray(parsed.links) ? parsed.links.length : null,
      });
      return new NextResponse(JSON.stringify(parsed), {
        status: upstream.status,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });
    } catch {
      console.warn("[estimate-project-links upstream non-json]", {
        method,
        status: upstream.status,
        bodyPreview: text.slice(0, 500),
      });
      console.info("[estimate-project-links upstream]", { method, status: upstream.status, non_json: true });
      return NextResponse.json(
        {
          success: false,
          code: "upstream_invalid_json",
          message: "Project紐づけAPIの応答が不正(JSON以外)です。",
        },
        { status: 502 },
      );
    }
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
  const payload = json as {
    estimate_id?: unknown;
    links?: unknown[];
  };
  console.info("[estimate-project-links PATCH payload]", {
    estimate_id: payload.estimate_id,
    link_count: Array.isArray(payload.links) ? payload.links.length : null,
  });
  return proxy(request, "PATCH", JSON.stringify(json));
}
