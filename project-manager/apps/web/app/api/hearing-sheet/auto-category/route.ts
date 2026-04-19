import { runAutoCategoryGemini } from "@/lib/hearing-auto-category-gemini";
import type { HearingAdviceProjectPayload } from "@/lib/hearing-gemini-advice";
import { getDefaultRowsForTemplate } from "@/lib/hearing-sheet-template-rows";
import { HEARING_TEMPLATE_IDS, type HearingTemplateId } from "@/lib/hearing-sheet-template-matrix";
import { NextResponse } from "next/server";
import { z } from "zod";

const templateIdEnum = z.enum(HEARING_TEMPLATE_IDS as unknown as [string, ...string[]]);

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
  id: z.string().min(1).max(128),
  heading: z.string().max(512),
  question: z.string().max(8192),
  category: z.string().max(512),
});

const bodySchema = z.object({
  project: projectSchema,
  template_id: templateIdEnum,
  rows: z.array(rowSchema).max(500),
  style: z.enum(["indexed", "label_only"]),
  extra_rules: z.string().max(8000).optional(),
});

function uniqueTemplateCategories(templateId: HearingTemplateId): string[] {
  const defaults = getDefaultRowsForTemplate(templateId);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of defaults) {
    const c = r.category.trim();
    if (c !== "" && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

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

  const { project, template_id, rows, style, extra_rules } = parsed.data;
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

  const tid = template_id as HearingTemplateId;
  const examples = uniqueTemplateCategories(tid);
  const out = await runAutoCategoryGemini(
    p,
    tid,
    rows,
    style,
    extra_rules ?? "",
    examples,
  );

  if (!out.ok) {
    return NextResponse.json({ success: false, message: out.message }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    labels: out.labels,
  });
}
