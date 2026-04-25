import type { JSONContent } from "@tiptap/core";
import { z } from "zod";

/** ブラウザから叩く BFF パス（拡張子なし） */
export const REQUIREMENTS_EDITOR_TEMPLATES_API_PATH = "/api/portal/requirements-editor-templates";

export const requirementsTemplateVisibilitySchema = z.enum(["private", "public"]);
export type RequirementsTemplateVisibility = z.infer<typeof requirementsTemplateVisibilitySchema>;

export const portalRequirementsTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  doc: z.any(),
  visibility: requirementsTemplateVisibilitySchema,
  locked: z.boolean(),
  created_by_user_id: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
  creator_email: z.string(),
  creator_display_name: z.string().nullable().optional(),
});

export type PortalRequirementsTemplate = {
  id: string;
  name: string;
  doc: JSONContent;
  visibility: RequirementsTemplateVisibility;
  locked: boolean;
  created_by_user_id: number;
  created_at: string;
  updated_at: string;
  creator_email: string;
  creator_display_name?: string | null;
};

export const portalRequirementsTemplatesListResponseSchema = z.object({
  success: z.literal(true),
  templates: z.array(portalRequirementsTemplateSchema),
});

export const portalRequirementsTemplateSingleResponseSchema = z.object({
  success: z.literal(true),
  template: portalRequirementsTemplateSchema,
});

export const portalRequirementsTemplatePostBodySchema = z.object({
  name: z.string().min(1).max(200),
  doc: z.any(),
  visibility: requirementsTemplateVisibilitySchema,
});

export const portalRequirementsTemplatePatchBodySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(200).optional(),
    doc: z.any().optional(),
    visibility: requirementsTemplateVisibilitySchema.optional(),
    locked: z.boolean().optional(),
  })
  .refine((b) => b.name !== undefined || b.doc !== undefined || b.visibility !== undefined || b.locked !== undefined, {
    message: "更新するフィールドを1つ以上指定してください。",
  });

function asJsonContent(raw: unknown): JSONContent {
  if (raw && typeof raw === "object") {
    return raw as JSONContent;
  }
  return { type: "doc", content: [] };
}

export async function fetchRequirementsTemplatesList(): Promise<
  { ok: true; templates: PortalRequirementsTemplate[] } | { ok: false; message: string }
> {
  const res = await fetch(REQUIREMENTS_EDITOR_TEMPLATES_API_PATH, { credentials: "include", cache: "no-store" });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, message: "一覧の解析に失敗しました。" };
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && "message" in data && typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : `一覧の取得に失敗しました（HTTP ${res.status}）。`;
    return { ok: false, message: msg };
  }
  const parsed = portalRequirementsTemplatesListResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, message: "一覧の形式が不正です。" };
  }
  const templates: PortalRequirementsTemplate[] = parsed.data.templates.map((t) => ({
    ...t,
    doc: asJsonContent(t.doc),
  }));
  return { ok: true, templates };
}

export async function postRequirementsTemplate(body: {
  name: string;
  doc: JSONContent;
  visibility: RequirementsTemplateVisibility;
}): Promise<
  | { ok: true; template: PortalRequirementsTemplate }
  | { ok: false; message: string; status: number; duplicateExistingId?: string }
> {
  const res = await fetch(REQUIREMENTS_EDITOR_TEMPLATES_API_PATH, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, message: "応答の解析に失敗しました。", status: res.status };
  }
  if (res.status === 409 && typeof data === "object" && data !== null) {
    const ex = "existing_id" in data && typeof (data as { existing_id: unknown }).existing_id === "string" ? (data as { existing_id: string }).existing_id : "";
    const msg =
      "message" in data && typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : "同じ名前のテンプレートが既にあります。";
    return { ok: false, message: msg, status: 409, duplicateExistingId: ex || undefined };
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && "message" in data && typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : `保存に失敗しました（HTTP ${res.status}）。`;
    return { ok: false, message: msg, status: res.status };
  }
  const parsed = portalRequirementsTemplateSingleResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, message: "応答の形式が不正です。", status: res.status };
  }
  const t = parsed.data.template;
  return {
    ok: true,
    template: { ...t, doc: asJsonContent(t.doc) },
  };
}

export async function patchRequirementsTemplate(body: z.infer<typeof portalRequirementsTemplatePatchBodySchema>): Promise<
  { ok: true; template: PortalRequirementsTemplate } | { ok: false; message: string; status: number }
> {
  const res = await fetch(REQUIREMENTS_EDITOR_TEMPLATES_API_PATH, {
    method: "PATCH",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, message: "応答の解析に失敗しました。", status: res.status };
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && "message" in data && typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : `更新に失敗しました（HTTP ${res.status}）。`;
    return { ok: false, message: msg, status: res.status };
  }
  const parsed = portalRequirementsTemplateSingleResponseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, message: "応答の形式が不正です。", status: res.status };
  }
  const t = parsed.data.template;
  return { ok: true, template: { ...t, doc: asJsonContent(t.doc) } };
}

export async function deleteRequirementsTemplate(id: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch(`${REQUIREMENTS_EDITOR_TEMPLATES_API_PATH}?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, message: "応答の解析に失敗しました。" };
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && "message" in data && typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : `削除に失敗しました（HTTP ${res.status}）。`;
    return { ok: false, message: msg };
  }
  const ok = typeof data === "object" && data !== null && "success" in data && (data as { success: unknown }).success === true;
  if (!ok) {
    return { ok: false, message: "削除応答が不正です。" };
  }
  return { ok: true };
}
