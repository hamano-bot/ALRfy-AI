import { type NextRequest, NextResponse } from "next/server";
import { portalProjectHearingSheetPatchBodySchema } from "@/lib/portal-project-hearing-sheet";

export const dynamic = "force-dynamic";

const UPSTREAM_PATH = "/portal/api/project-hearing-sheet";
const UPSTREAM_TIMEOUT_MS = 30_000;

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function GET(request: NextRequest) {
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

  const projectIdRaw = request.nextUrl.searchParams.get("project_id");
  const projectId = projectIdRaw !== null && /^\d+$/.test(projectIdRaw) ? Number.parseInt(projectIdRaw, 10) : NaN;
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return NextResponse.json({ success: false, message: "project_id は正の整数で指定してください。" }, { status: 400 });
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

export async function PATCH(request: NextRequest) {
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

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "JSON ボディが不正です。" }, { status: 400 });
  }

  const parsed = portalProjectHearingSheetPatchBodySchema.safeParse(json);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const first =
      flat.formErrors[0] ??
      parsed.error.issues[0]?.message ??
      "リクエストの形式が不正です。";
    return NextResponse.json(
      {
        success: false,
        message: first,
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const base = trimTrailingSlashes(rawBase.trim());
  const url = `${base}${UPSTREAM_PATH}`;
  const cookie = request.headers.get("cookie");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(url, {
      method: "PATCH",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json; charset=utf-8",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(parsed.data),
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
