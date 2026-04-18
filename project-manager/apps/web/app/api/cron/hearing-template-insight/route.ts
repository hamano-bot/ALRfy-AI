import {
  portalFetchHearingInsightBatchState,
  portalFetchHearingInsightExport,
  portalFetchHearingTemplateDefinitionCron,
  portalPatchHearingInsightBatchState,
  portalPatchHearingTemplateDefinition,
} from "@/lib/portal-hearing-insight-fetch";
import { mergeHearingTemplateWithGemini } from "@/lib/hearing-insight-merge-gemini";
import { HEARING_TEMPLATE_IDS, type HearingTemplateId } from "@/lib/hearing-sheet-template-matrix";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function cronAuthOk(request: NextRequest): boolean {
  const secret = process.env.HEARING_INSIGHT_CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }
  const h = request.headers.get("x-cron-secret") ?? request.headers.get("authorization");
  if (h?.startsWith("Bearer ")) {
    return h.slice(7).trim() === secret;
  }
  return h?.trim() === secret;
}

/**
 * 日次バッチ: デルタ解析行を Gemini でテンプレ定義にマージし、system_update_events は PHP 側で記録。
 * 呼び出し: `X-Cron-Secret` または `Authorization: Bearer <HEARING_INSIGHT_CRON_SECRET>`
 */
export async function POST(request: NextRequest) {
  if (!cronAuthOk(request)) {
    return NextResponse.json({ success: false, message: "認可に失敗しました。" }, { status: 403 });
  }

  let since = "1970-01-01 00:00:00";
  try {
    const st = await portalFetchHearingInsightBatchState();
    if (st.last_run_at && st.last_run_at.trim() !== "") {
      since = st.last_run_at.trim();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "batch state 取得失敗";
    return NextResponse.json({ success: false, message: msg }, { status: 503 });
  }

  const results: { template_id: string; status: string; detail?: string }[] = [];

  for (const tid of HEARING_TEMPLATE_IDS as readonly HearingTemplateId[]) {
    try {
      const rows = await portalFetchHearingInsightExport(tid, since);
      if (rows.length === 0) {
        results.push({ template_id: tid, status: "skipped_empty" });
        continue;
      }

      const def = await portalFetchHearingTemplateDefinitionCron(tid);
      const merged = await mergeHearingTemplateWithGemini(tid, rows, def.body_json);
      if (!merged.ok) {
        results.push({ template_id: tid, status: "gemini_error", detail: merged.message });
        continue;
      }

      await portalPatchHearingTemplateDefinition({
        template_id: tid,
        expected_version: def.version,
        body_json: merged.data,
      });
      results.push({ template_id: tid, status: "ok" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ template_id: tid, status: "error", detail: msg });
    }
  }

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  try {
    await portalPatchHearingInsightBatchState(stamp);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { success: false, message: `バッチ時刻の保存に失敗: ${msg}`, results },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, last_run_at: stamp, since, results });
}
