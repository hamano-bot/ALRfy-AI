import { mapSitemapGeminiChat, type SitemapChatMessage } from "@/lib/requirements-sitemap-gemini-map";
import { sitemapContentSchema } from "@/lib/requirements-sitemap-schema";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const requestSchema = z.object({
  current: sitemapContentSchema,
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "model"]),
        text: z.string().max(12_000),
      }),
    )
    .max(24),
  lastUserMessage: z.string().min(1).max(12_000),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "JSON 本文が必要です。" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: parsed.error.errors.map((e) => e.message).join("；") },
      { status: 400 },
    );
  }
  const { current, messages, lastUserMessage } = parsed.data;
  const mapped = await mapSitemapGeminiChat({
    current,
    messages: messages as SitemapChatMessage[],
    lastUserMessage,
  });
  if (!mapped.ok) {
    return NextResponse.json({ success: false, message: mapped.message }, { status: 502 });
  }
  return NextResponse.json({ success: true, content: mapped.data });
}
