import type { HearingAdviceSuggestion } from "@/lib/hearing-advice-types";
import type { HearingAdviceProjectPayload } from "@/lib/hearing-gemini-advice";
import type { PortalProjectDetail } from "@/lib/portal-project";
import type { HearingSheetRow } from "@/lib/hearing-sheet-types";

export function projectToAdvicePayload(project: PortalProjectDetail): HearingAdviceProjectPayload {
  return {
    name: project.name,
    client_name: project.client_name,
    site_type: project.site_type,
    site_type_other: project.site_type_other,
    is_renewal: project.is_renewal,
    kickoff_date: project.kickoff_date,
    release_due_date: project.release_due_date,
    renewal_urls: [...project.renewal_urls],
  };
}

/** 指摘を現在の行に紐づける（row_id 優先、次に見出し一致） */
export function resolveAdviceToRowId(s: HearingAdviceSuggestion, rows: HearingSheetRow[]): string | null {
  const rid = s.row_id?.trim();
  if (rid && rows.some((r) => r.id === rid)) {
    return rid;
  }
  const h = s.heading?.trim();
  if (h) {
    const m = rows.find((r) => r.heading.trim() === h);
    if (m) {
      return m.id;
    }
  }
  return null;
}

export function collectAdviceRowIds(suggestions: HearingAdviceSuggestion[], rows: HearingSheetRow[]): Set<string> {
  const ids = new Set<string>();
  for (const s of suggestions) {
    const id = resolveAdviceToRowId(s, rows);
    if (id) {
      ids.add(id);
    }
  }
  return ids;
}
