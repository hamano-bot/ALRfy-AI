import { runHearingAdviceGemini, type HearingAdviceProjectPayload } from "@/lib/hearing-gemini-advice";
import { HEARING_TEMPLATE_IDS, type HearingTemplateId } from "@/lib/hearing-sheet-template-matrix";
import { NextResponse } from "next/server";
import { z } from "zod";

const templateIdEnum = z.enum(HEARING_TEMPLATE_IDS as unknown as [string, ...string[]]);

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const itemSchema = z.object({
  id: z.string().min(1).max(128),
  category: z.string().max(512),
  heading: z.string().max(512),
  question: z.string().max(8192),
  answer: z.string().max(8192),
  assignee: z.string().max(512),
  due: z.string().max(128),
  row_status: z.string().max(512),
});

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

const bodySchema = z.object({
  project: projectSchema,
  template_id: templateIdEnum,
  items: z.array(itemSchema).max(500),
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
    const first = parsed.error.issues[0];
    return NextResponse.json(
      {
        success: false,
        message: first?.message ?? "リクエスト形式が不正です。",
      },
      { status: 400 },
    );
  }

  const { project, template_id, items } = parsed.data;
  const p: HearingAdviceProjectPayload = {
    name: project.name,
    client_name: project.client_name,
    site_type: project.site_type,
    site_type_other: project.site_type_other,
    is_renewal: project.is_renewal,
    kickoff_date: project.kickoff_date,
    release_due_date: project.release_due_date,
    renewal_urls: project.renewal_urls,
  };

  const out = await runHearingAdviceGemini(p, template_id as HearingTemplateId, items);
  if (!out.ok) {
    return NextResponse.json({ success: false, message: out.message }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    suggestions: out.suggestions,
  });
}
