import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const UPSTREAM_PATH = "/portal/api/project-permission";
const UPSTREAM_TIMEOUT_MS = 10_000;

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function parsePositiveProjectId(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") {
    return null;
  }
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}

export async function GET(request: NextRequest) {
  const projectId = parsePositiveProjectId(request.nextUrl.searchParams.get("project_id"));
  if (projectId === null) {
    return NextResponse.json(
      {
        success: false,
        code: "invalid_project_id",
        message: "project_id には正の整数を指定してください。",
      },
      { status: 400 },
    );
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
  const url = `${base}${UPSTREAM_PATH}?project_id=${encodeURIComponent(String(projectId))}`;
  const cookie = request.headers.get("cookie");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(url, {
      method: "GET",
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
