import type { HearingAdviceProjectPayload } from "@/lib/hearing-gemini-advice";
import { runRedmineSubjectGemini } from "@/lib/hearing-redmine-subject-gemini";
import type { HearingSheetRow } from "@/lib/hearing-sheet-types";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const projectSchema = z.object({
  name: z.string().max(255),
  client_name: z.string().max(255).nullable(),
  site_type: z.string().nullable(),
  site_type_other: z.string().nullable(),
  is_renewal: z.boolean(),
  kickoff_date: z.string().nullable(),
  release_due_date: z.string().nullable(),
  renewal_urls: z.array(z.string().max(2048)),
});

const rowSchema = z.object({
  category: z.string().max(512),
  heading: z.string().max(512),
  question: z.string().max(8192),
  answer: z.string().max(8192),
  assignee: z.string().max(512),
  due: z.string().max(64),
  row_status: z.string().max(64),
});

const bodySchema = z.object({
  project: projectSchema,
  row: rowSchema,
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "JSON ボディが不正です。" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "入力が不正です。" }, { status: 400 });
  }

  const row: Pick<HearingSheetRow, "category" | "heading" | "question" | "answer" | "assignee" | "due" | "row_status"> =
    parsed.data.row;
  const p = parsed.data.project;
  const payload: HearingAdviceProjectPayload = {
    name: p.name,
    client_name: p.client_name,
    site_type: p.site_type,
    site_type_other: p.site_type_other,
    is_renewal: p.is_renewal,
    kickoff_date: p.kickoff_date,
    release_due_date: p.release_due_date,
    renewal_urls: [...p.renewal_urls],
  };
  const result = await runRedmineSubjectGemini(payload, row);
  if (!result.ok) {
    return NextResponse.json({ success: false, message: result.message }, { status: 502 });
  }
  return NextResponse.json({ success: true, subject: result.subject });
}
