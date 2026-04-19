import { createDefaultRequirementsBody } from "@/lib/requirements-doc-default-body";
import { requirementsDocBodySchema } from "@/lib/requirements-doc-body-schema";
import { migrateLegacyTipTapInBody } from "@/lib/requirements-doc-tiptap-migrate";
import type { RequirementsDocBody, RequirementsPage } from "@/lib/requirements-doc-types";

/** 表紙を先頭に（同一 pageType の重複は想定外だが、先頭の cover を優先） */
function ensureCoverFirst(pages: RequirementsPage[]): RequirementsPage[] {
  const cover = pages.find((p) => p.pageType === "cover");
  if (!cover) {
    return pages;
  }
  const rest = pages.filter((p) => p.id !== cover.id);
  return [cover, ...rest];
}

/**
 * API から来た body_json を検証し、不正または空なら既定の14ページを返す。
 */
export function normalizeRequirementsDocBody(raw: unknown): RequirementsDocBody {
  const parsed = requirementsDocBodySchema.safeParse(raw);
  if (!parsed.success) {
    return createDefaultRequirementsBody();
  }
  const migrated = migrateLegacyTipTapInBody(parsed.data);
  const active = migrated.pages.filter((p) => !p.deleted);
  if (active.length === 0) {
    return createDefaultRequirementsBody();
  }
  const pages = ensureCoverFirst(migrated.pages);
  return { ...migrated, pages };
}
