import { z } from "zod";
import { HEARING_TEMPLATE_IDS, type HearingTemplateId } from "@/lib/hearing-sheet-template-matrix";

const hearingRowSchema = z.object({
  id: z.string().min(1).max(128),
  category: z.string().max(512),
  heading: z.string().max(512),
  question: z.string().max(8192),
  answer: z.string().max(8192),
  assignee: z.string().max(512),
  due: z.string().max(128),
  row_status: z.string().max(512),
});

const templateIdSchema = z.string().refine(
  (s): s is HearingTemplateId => (HEARING_TEMPLATE_IDS as readonly string[]).includes(s),
  { message: "template_id が不正です" },
);

/**
 * PATCH 時の body_json の構造（Zod で JSON Schema 相当の検証）。
 * テンプレ ID は列挙に固定。
 */
export const hearingSheetBodyJsonSchema = z.object({
  template_id: templateIdSchema,
  items: z.array(hearingRowSchema).max(500),
});

export type HearingSheetBodyJson = z.infer<typeof hearingSheetBodyJsonSchema>;

export function safeParseHearingBodyJson(
  raw: unknown,
): { ok: true; data: HearingSheetBodyJson } | { ok: false; message: string } {
  const r = hearingSheetBodyJsonSchema.safeParse(raw);
  if (!r.success) {
    const first = r.error.issues[0];
    const msg = first ? `${first.path.join(".")}: ${first.message}` : "body_json の形式が不正です。";
    return { ok: false, message: msg };
  }
  return { ok: true, data: r.data };
}
