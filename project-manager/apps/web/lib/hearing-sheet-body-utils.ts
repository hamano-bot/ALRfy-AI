import { isHearingTemplateId } from "@/lib/hearing-sheet-template-matrix";
import type { HearingRowRedmineTicket, HearingSheetRow } from "@/lib/hearing-sheet-types";
import type { HearingTemplateId } from "@/lib/hearing-sheet-template-matrix";

export function normalizeHearingRows(raw: unknown): HearingSheetRow[] {
  if (raw === null || raw === undefined) {
    return [];
  }
  let items: unknown;
  if (Array.isArray(raw)) {
    items = raw;
  } else if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    items = o.items;
  } else {
    return [];
  }
  if (!Array.isArray(items)) {
    return [];
  }
  const out: HearingSheetRow[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object" || Array.isArray(it)) {
      continue;
    }
    const r = it as Record<string, unknown>;
    const id = typeof r.id === "string" && r.id !== "" ? r.id : `row-${out.length}`;
    const row: HearingSheetRow = {
      id,
      category: typeof r.category === "string" ? r.category : "",
      heading: typeof r.heading === "string" ? r.heading : "",
      question: typeof r.question === "string" ? r.question : "",
      answer: typeof r.answer === "string" ? r.answer : "",
      assignee: typeof r.assignee === "string" ? r.assignee : "",
      due: typeof r.due === "string" ? r.due : "",
      row_status: typeof r.row_status === "string" ? r.row_status : "",
    };

    const tickets: HearingRowRedmineTicket[] = [];
    const rawList = r.redmine_tickets;
    if (Array.isArray(rawList)) {
      for (const x of rawList) {
        if (!x || typeof x !== "object" || Array.isArray(x)) {
          continue;
        }
        const o = x as Record<string, unknown>;
        const iid = o.issue_id;
        const pid = o.project_id;
        const bu = o.base_url;
        let issueId = 0;
        if (typeof iid === "number" && Number.isFinite(iid) && iid > 0) {
          issueId = iid;
        } else if (typeof iid === "string" && /^\d+$/.test(iid)) {
          const n = Number.parseInt(iid, 10);
          if (n > 0) {
            issueId = n;
          }
        }
        let projectId = 0;
        if (typeof pid === "number" && Number.isFinite(pid) && pid > 0) {
          projectId = pid;
        } else if (typeof pid === "string" && /^\d+$/.test(pid)) {
          const n = Number.parseInt(pid, 10);
          if (n > 0) {
            projectId = n;
          }
        }
        if (issueId <= 0 || projectId <= 0) {
          continue;
        }
        const t: HearingRowRedmineTicket = { issue_id: issueId, project_id: projectId };
        if (bu === null) {
          t.base_url = null;
        } else if (typeof bu === "string") {
          t.base_url = bu;
        }
        tickets.push(t);
      }
    }

    if (tickets.length === 0) {
      const rid = r.redmine_issue_id;
      const rpid = r.redmine_project_id;
      const rbu = r.redmine_base_url;
      let issueId = 0;
      if (typeof rid === "number" && Number.isFinite(rid) && rid > 0) {
        issueId = rid;
      } else if (typeof rid === "string" && /^\d+$/.test(rid)) {
        const n = Number.parseInt(rid, 10);
        if (n > 0) {
          issueId = n;
        }
      }
      let projectId = 0;
      if (typeof rpid === "number" && Number.isFinite(rpid) && rpid > 0) {
        projectId = rpid;
      } else if (typeof rpid === "string" && /^\d+$/.test(rpid)) {
        const n = Number.parseInt(rpid, 10);
        if (n > 0) {
          projectId = n;
        }
      }
      if (issueId > 0 && projectId > 0) {
        const t: HearingRowRedmineTicket = { issue_id: issueId, project_id: projectId };
        if (rbu === null) {
          t.base_url = null;
        } else if (typeof rbu === "string") {
          t.base_url = rbu;
        }
        tickets.push(t);
      }
    }

    if (tickets.length > 0) {
      row.redmine_tickets = tickets;
    }
    out.push(row);
  }
  return out;
}

/** body_json オブジェクトから template_id を読む（無ければ null） */
export function parseTemplateIdFromBody(raw: unknown): HearingTemplateId | null {
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const tid = (raw as Record<string, unknown>).template_id;
  if (typeof tid !== "string" || !isHearingTemplateId(tid)) {
    return null;
  }
  return tid;
}

export function hearingBodyFromRows(templateId: HearingTemplateId, rows: HearingSheetRow[]): Record<string, unknown> {
  return {
    template_id: templateId,
    items: rows.map((r) => ({ ...r })),
  };
}

export function createEmptyHearingRow(): HearingSheetRow {
  const id =
    typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `row-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    id,
    category: "",
    heading: "",
    question: "",
    answer: "",
    assignee: "",
    due: "",
    row_status: "",
  };
}
