import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const UPSTREAM_PATH = "/portal/api/project-redmine-issue-create";
const UPSTREAM_TIMEOUT_MS = 45_000;

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function POST(request: NextRequest) {
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
  let body: string;
  try {
    body = await request.text();
  } catch {
    return NextResponse.json({ success: false, message: "リクエスト本文を読めませんでした。" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(url, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body,
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
      {
        success: false,
        code: "upstream_unreachable",
        message: "ポータル API に接続できませんでした。",
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
