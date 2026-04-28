import { type NextRequest, NextResponse } from "next/server";
import { estimateDuplicateSchema } from "@/lib/portal-estimate";

export const dynamic = "force-dynamic";
const UPSTREAM_PATH = "/portal/api/estimate-duplicate";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
    // #region agent log
    fetch('http://127.0.0.1:7870/ingest/d3eabf84-6c86-4277-b829-e548b07d84d8',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4c935d'},body:JSON.stringify({sessionId:'4c935d',runId:'initial',hypothesisId:'H1',location:'estimate-duplicate/route.ts:POST:parsed',message:'parsed request body',data:{hasEstimateId:typeof (json as {estimate_id?:unknown})?.estimate_id!=='undefined'},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  } catch {
    return NextResponse.json({ success: false, message: "JSON ボディが不正です。" }, { status: 400 });
  }
  const parsed = estimateDuplicateSchema.safeParse(json);
  if (!parsed.success) {
    // #region agent log
    fetch('http://127.0.0.1:7870/ingest/d3eabf84-6c86-4277-b829-e548b07d84d8',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4c935d'},body:JSON.stringify({sessionId:'4c935d',runId:'initial',hypothesisId:'H2',location:'estimate-duplicate/route.ts:POST:validation',message:'schema validation failed',data:{issue:parsed.error.issues[0]?.message??null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return NextResponse.json({ success: false, message: parsed.error.issues[0]?.message ?? "リクエストが不正です。" }, { status: 400 });
  }
  const rawBase = process.env.PORTAL_API_BASE_URL;
  if (!rawBase || rawBase.trim() === "") {
    return NextResponse.json({ success: false, code: "missing_config", message: "PORTAL_API_BASE_URL が未設定です。" }, { status: 503 });
  }
  const cookie = request.headers.get("cookie");
  const url = `${trimTrailingSlashes(rawBase.trim())}${UPSTREAM_PATH}`;
  try {
    const upstream = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json; charset=utf-8",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(parsed.data),
    });
    const text = await upstream.text();
    // #region agent log
    fetch('http://127.0.0.1:7870/ingest/d3eabf84-6c86-4277-b829-e548b07d84d8',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4c935d'},body:JSON.stringify({sessionId:'4c935d',runId:'initial',hypothesisId:'H3',location:'estimate-duplicate/route.ts:POST:upstream',message:'upstream response received',data:{status:upstream.status,ok:upstream.ok,url},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch {
    // #region agent log
    fetch('http://127.0.0.1:7870/ingest/d3eabf84-6c86-4277-b829-e548b07d84d8',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4c935d'},body:JSON.stringify({sessionId:'4c935d',runId:'initial',hypothesisId:'H4',location:'estimate-duplicate/route.ts:POST:catch',message:'upstream fetch failed',data:{url},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return NextResponse.json({ success: false, code: "upstream_unreachable", message: "ポータル API に接続できませんでした。" }, { status: 502 });
  }
}
