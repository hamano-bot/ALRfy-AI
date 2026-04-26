import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const UPSTREAM_PATH = "/portal/api/estimate-export-html";
const UPSTREAM_FALLBACK_PATH = "/portal/api/post_estimate_export_html.php";
const UPSTREAM_TIMEOUT_MS = 30_000;

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function POST(request: NextRequest) {
  const rawBase = process.env.PORTAL_API_BASE_URL;
  if (!rawBase || rawBase.trim() === "") {
    return NextResponse.json({ success: false, code: "missing_config", message: "PORTAL_API_BASE_URL が未設定です。" }, { status: 503 });
  }
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "JSON ボディが不正です。" }, { status: 400 });
  }
  const cookie = request.headers.get("cookie");
  const base = trimTrailingSlashes(rawBase.trim());
  const primaryUrl = `${base}${UPSTREAM_PATH}`;
  const fallbackUrl = `${base}${UPSTREAM_FALLBACK_PATH}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const doFetch = async (url: string) =>
      fetch(url, {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json; charset=utf-8",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify(json),
      });

    let upstream = await doFetch(primaryUrl);
    if (upstream.status === 404 || upstream.status === 405) {
      upstream = await doFetch(fallbackUrl);
    }
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ success: false, code: "upstream_unreachable", message: "ポータル API に接続できませんでした。" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
