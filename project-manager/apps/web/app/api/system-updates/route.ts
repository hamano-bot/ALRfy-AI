import rawUpdates from "@/app/data/updates.json";
import { HEARING_TEMPLATE_LABELS, isHearingTemplateId } from "@/lib/hearing-sheet-template-matrix";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type StaticItem = {
  id: string;
  datetime: string;
  version: string;
  title: string;
  summary?: string;
};

type MergedItem = {
  id: string;
  datetime: string;
  version?: string;
  title: string;
  summary?: string;
  kind: "deploy" | "template";
  template_id?: string | null;
  template_version_before?: number | null;
  template_version_after?: number | null;
  detail?: unknown;
};

const staticList = rawUpdates as readonly StaticItem[];

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export async function GET(request: NextRequest) {
  const merged: MergedItem[] = staticList.map((u) => ({
    id: u.id,
    datetime: u.datetime,
    version: u.version,
    title: u.title,
    summary: u.summary ?? "",
    kind: "deploy" as const,
  }));

  const rawBase = process.env.PORTAL_API_BASE_URL;
  const cookie = request.headers.get("cookie");
  if (rawBase && rawBase.trim() !== "" && cookie) {
    const base = trimTrailingSlashes(rawBase.trim());
    const url = `${base}/portal/api/system-update-events?limit=100`;
    try {
      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json", Cookie: cookie },
      });
      const text = await res.text();
      const j = JSON.parse(text) as {
        success?: boolean;
        events?: Array<{
          id: string;
          datetime: string;
          kind?: string;
          title: string;
          summary?: string;
          template_id?: string | null;
          template_version_before?: number | null;
          template_version_after?: number | null;
          detail?: unknown;
        }>;
      };
      if (res.ok && j.success && Array.isArray(j.events)) {
        for (const ev of j.events) {
          const tid = ev.template_id;
          const label = tid && isHearingTemplateId(tid) ? HEARING_TEMPLATE_LABELS[tid] : (tid ?? "");
          merged.push({
            id: `tpl-${ev.id}`,
            datetime: ev.datetime,
            title: label ? `${ev.title}（${label}）` : ev.title,
            summary: ev.summary ?? "",
            kind: "template",
            template_id: ev.template_id ?? null,
            template_version_before: ev.template_version_before ?? null,
            template_version_after: ev.template_version_after ?? null,
            detail: ev.detail ?? null,
          });
        }
      }
    } catch {
      /* ポータル未接続時は静的のみ */
    }
  }

  merged.sort((a, b) => {
    const ta = Date.parse(a.datetime.replace(" ", "T"));
    const tb = Date.parse(b.datetime.replace(" ", "T"));
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });

  return NextResponse.json({ success: true, updates: merged });
}
