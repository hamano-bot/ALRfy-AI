import type {
  RequirementsInputMode,
  RequirementsPage,
  RequirementsPageContentRichtext,
  RequirementsPageContentSplit,
  RequirementsPageContentTable,
  RequirementsTableRow,
} from "@/lib/requirements-doc-types";
import { defaultSitemapContent } from "@/lib/requirements-sitemap-schema";
import { EMPTY_TIPTAP_DOC } from "@/lib/tiptap-json";

function newRowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const DEFAULT_LABELS = ["項目", "内容", "備考"] as const;

export function defaultRichtextContent(): RequirementsPageContentRichtext {
  return { doc: EMPTY_TIPTAP_DOC };
}

export function defaultTableContent(): RequirementsPageContentTable {
  return {
    columnLabels: [...DEFAULT_LABELS],
    rows: [{ id: newRowId(), cells: DEFAULT_LABELS.map(() => "") }],
  };
}

export function defaultSplitContent(): RequirementsPageContentSplit {
  return {
    editorDoc: EMPTY_TIPTAP_DOC,
    columnLabels: [...DEFAULT_LABELS] as [string, string, string],
    rows: [{ id: newRowId(), cells: ["", "", ""] }],
  };
}

export function defaultContentForMode(mode: RequirementsInputMode): RequirementsPage["content"] {
  switch (mode) {
    case "richtext":
      return defaultRichtextContent();
    case "table":
      return defaultTableContent();
    case "split_editor_table":
      return defaultSplitContent();
    case "sitemap":
      return defaultSitemapContent();
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function emptyTableRow(): RequirementsTableRow {
  return { id: newRowId(), cells: DEFAULT_LABELS.map(() => "") };
}

export function emptyTableRowByColumnCount(columnCount: number): RequirementsTableRow {
  const size = Math.max(1, Math.min(6, columnCount));
  return { id: newRowId(), cells: Array.from({ length: size }, () => "") };
}

/** 入力方式変更時はコンテンツを初期化する（計画どおり） */
export function pageWithNewInputMode(page: RequirementsPage, mode: RequirementsInputMode): RequirementsPage {
  const base = {
    id: page.id,
    pageType: page.pageType,
    title: page.title,
    createdOn: page.createdOn ?? null,
    updatedOn: page.updatedOn ?? null,
    is_fixed: page.is_fixed,
    deleted: page.deleted,
  };
  if (mode === "richtext") {
    return { ...base, inputMode: "richtext", content: defaultRichtextContent() };
  }
  if (mode === "table") {
    return { ...base, inputMode: "table", content: defaultTableContent() };
  }
  if (mode === "split_editor_table") {
    return { ...base, inputMode: "split_editor_table", content: defaultSplitContent() };
  }
  return { ...base, inputMode: "sitemap", content: defaultSitemapContent() };
}
