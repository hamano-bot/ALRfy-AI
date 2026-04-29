import { type NextRequest, NextResponse } from "next/server";
import { fetchPortalMyProjectsRaw } from "@/lib/portal-my-projects";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.search;
  const raw = await fetchPortalMyProjectsRaw(request.headers.get("cookie"), search);
  if (raw.ok === false && raw.reason === "missing_config") {
    return NextResponse.json(
      {
        success: false,
        code: "missing_config",
        message: "PORTAL_API_BASE_URL が未設定のためポータル API に接続できません。",
      },
      { status: 503 },
    );
  }
  if (raw.ok === false && raw.reason === "upstream_unreachable") {
    return NextResponse.json(
      {
        success: false,
        code: "upstream_unreachable",
        message: "ポータル API に接続できませんでした。",
      },
      { status: 502 },
    );
  }

  return new NextResponse(raw.text, {
    status: raw.status,
    headers: {
      "Content-Type": raw.contentType,
      "Cache-Control": "no-store",
    },
  });
}
