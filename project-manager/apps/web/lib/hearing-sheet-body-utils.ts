import { isHearingTemplateId } from "@/lib/hearing-sheet-template-matrix";
import type { HearingSheetRow } from "@/lib/hearing-sheet-types";
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
    out.push({
      id,
      category: typeof r.category === "string" ? r.category : "",
      heading: typeof r.heading === "string" ? r.heading : "",
      question: typeof r.question === "string" ? r.question : "",
      answer: typeof r.answer === "string" ? r.answer : "",
      assignee: typeof r.assignee === "string" ? r.assignee : "",
      due: typeof r.due === "string" ? r.due : "",
      row_status: typeof r.row_status === "string" ? r.row_status : "",
    });
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
