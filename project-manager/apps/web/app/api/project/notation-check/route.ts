import { NextResponse } from "next/server";
import { z } from "zod";
import { runProjectNotationCheckGemini } from "@/lib/project-notation-check-gemini";

const reqSchema = z.object({
  project_name: z.string().trim().min(1).max(255),
  client_name: z.string().trim().max(255).nullable(),
  misc_links: z
    .array(
      z.object({
        label: z.string().trim().max(255),
        url: z.string().trim().max(2048),
      }),
    )
    .default([]),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "JSON ボディが不正です。" }, { status: 400 });
  }

  const parsed = reqSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "入力値が不正です。";
    return NextResponse.json({ success: false, message: first }, { status: 400 });
  }

  const out = await runProjectNotationCheckGemini(parsed.data);
  if (!out.ok) {
    return NextResponse.json({ success: false, message: out.message }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    blockingIssues: out.blockingIssues,
    warnings: out.warnings,
  });
}
