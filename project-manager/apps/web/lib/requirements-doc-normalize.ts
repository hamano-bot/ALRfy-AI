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

function coerceLegacyWideTableColumns(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") {
    return raw;
  }
  const src = raw as { pages?: unknown[] };
  if (!Array.isArray(src.pages)) {
    return raw;
  }
  const pages = src.pages.map((page) => {
    if (!page || typeof page !== "object") {
      return page;
    }
    const p = page as { inputMode?: unknown; content?: unknown };
    if (p.inputMode !== "table" || !p.content || typeof p.content !== "object") {
      return page;
    }
    const content = p.content as { columnLabels?: unknown; rows?: unknown };
    const labels = Array.isArray(content.columnLabels) ? content.columnLabels.slice(0, 6) : content.columnLabels;
    const rows = Array.isArray(content.rows)
      ? content.rows.map((row) => {
          if (!row || typeof row !== "object") {
            return row;
          }
          const r = row as { cells?: unknown };
          if (!Array.isArray(r.cells)) {
            return row;
          }
          return { ...r, cells: r.cells.slice(0, 6) };
        })
      : content.rows;
    return { ...p, content: { ...content, columnLabels: labels, rows } };
  });
  return { ...(raw as Record<string, unknown>), pages };
}

/**
 * API から来た body_json を検証し、不正または空なら既定の14ページを返す。
 */
export function normalizeRequirementsDocBody(raw: unknown): RequirementsDocBody {
  let parsed = requirementsDocBodySchema.safeParse(raw);
  if (!parsed.success) {
    parsed = requirementsDocBodySchema.safeParse(coerceLegacyWideTableColumns(raw));
  }
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
