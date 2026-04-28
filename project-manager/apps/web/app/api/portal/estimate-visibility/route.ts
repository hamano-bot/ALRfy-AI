import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const UPSTREAM_PATH = "/portal/api/get_patch_estimate_visibility.php";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

async function proxy(request: NextRequest, method: "GET" | "PATCH", body?: string) {
  const rawBase = process.env.PORTAL_API_BASE_URL;
  if (!rawBase || rawBase.trim() === "") {
    return NextResponse.json({ success: false, code: "missing_config", message: "PORTAL_API_BASE_URL が未設定です。" }, { status: 503 });
  }
  const query = request.nextUrl.search ? request.nextUrl.search : "";
  const url = `${trimTrailingSlashes(rawBase.trim())}${UPSTREAM_PATH}${query}`;
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
        effective_role?: string;
        visibility_scope?: string;
        user_permissions?: unknown[];
        team_permissions?: unknown[];
      };
      console.info("[estimate-visibility upstream]", {
        method,
        status: upstream.status,
        success: parsed.success ?? null,
        message: parsed.message ?? null,
        effective_role: parsed.effective_role ?? null,
        visibility_scope: parsed.visibility_scope ?? null,
        user_count: Array.isArray(parsed.user_permissions) ? parsed.user_permissions.length : null,
        team_count: Array.isArray(parsed.team_permissions) ? parsed.team_permissions.length : null,
      });
      return new NextResponse(JSON.stringify(parsed), {
        status: upstream.status,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });
    } catch {
      console.info("[estimate-visibility upstream]", { method, status: upstream.status, non_json: true });
      return NextResponse.json(
        {
          success: false,
          code: "upstream_invalid_json",
          message: "公開範囲APIの応答が不正(JSON以外)です。",
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
    visibility_scope?: unknown;
    team_permissions?: unknown[];
    user_permissions?: unknown[];
  };
  console.info("[estimate-visibility PATCH payload]", {
    estimate_id: payload.estimate_id,
    visibility_scope: payload.visibility_scope,
    team_count: Array.isArray(payload.team_permissions) ? payload.team_permissions.length : null,
    user_count: Array.isArray(payload.user_permissions) ? payload.user_permissions.length : null,
  });
  // #region agent log
  fetch('http://127.0.0.1:7870/ingest/d3eabf84-6c86-4277-b829-e548b07d84d8',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'690a2d'},body:JSON.stringify({sessionId:'690a2d',runId:'run3',hypothesisId:'H6',location:'estimate-visibility/route.ts:PATCH',message:'visibility patch received by bff',data:{estimateId:Number(payload.estimate_id??0),visibilityScope:String(payload.visibility_scope??''),teamCount:Array.isArray(payload.team_permissions)?payload.team_permissions.length:null,userCount:Array.isArray(payload.user_permissions)?payload.user_permissions.length:null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return proxy(request, "PATCH", JSON.stringify(json));
}
