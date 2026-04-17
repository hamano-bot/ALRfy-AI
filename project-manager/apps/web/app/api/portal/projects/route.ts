import { type NextRequest, NextResponse } from "next/server";
import { portalProjectCreateBodySchema } from "@/lib/portal-project-create-body";

export const dynamic = "force-dynamic";

const UPSTREAM_PATH = "/portal/api/projects";
const UPSTREAM_TIMEOUT_MS = 30_000;

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

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "JSON ボディが不正です。" }, { status: 400 });
  }

  const parsed = portalProjectCreateBodySchema.safeParse(json);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const first =
      flat.formErrors[0] ??
      (typeof flat.fieldErrors.site_type_other?.[0] === "string" ? flat.fieldErrors.site_type_other[0] : null) ??
      parsed.error.issues[0]?.message;
    return NextResponse.json(
      {
        success: false,
        message: first ?? "リクエストの形式が不正です。",
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
      method: "POST",
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
