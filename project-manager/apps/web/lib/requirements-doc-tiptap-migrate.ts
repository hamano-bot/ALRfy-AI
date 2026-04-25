import type { JSONContent } from "@tiptap/core";
import type { RequirementsDocBodyParsed } from "@/lib/requirements-doc-body-schema";
import { EMPTY_TIPTAP_DOC, textToTipTapDoc } from "@/lib/tiptap-json";
import type { RequirementsDocBody, RequirementsPage } from "@/lib/requirements-doc-types";

function isDoc(v: unknown): v is JSONContent {
  return typeof v === "object" && v !== null && (v as { type?: unknown }).type === "doc";
}

/**
 * 旧形式（richtext: text のみ / split: editorText）を TipTap の doc に揃える。
 */
export function migrateLegacyTipTapInBody(body: RequirementsDocBodyParsed): RequirementsDocBody {
  return {
    ...body,
    pages: body.pages.map((p) => migratePage(p)),
  };
}

function baseDates(p: RequirementsDocBodyParsed["pages"][number]) {
  return {
    createdOn: p.createdOn ?? null,
    updatedOn: p.updatedOn ?? null,
  };
}

function migratePage(p: RequirementsDocBodyParsed["pages"][number]): RequirementsPage {
  const dates = baseDates(p);

  if (p.inputMode === "table") {
    return { ...p, ...dates };
  }

  if (p.inputMode === "sitemap") {
    return { ...p, ...dates };
  }

  if (p.inputMode === "richtext") {
    const c = p.content;
    if ("doc" in c && c.doc !== undefined && isDoc(c.doc)) {
      return { ...p, ...dates, inputMode: "richtext", content: { doc: c.doc } };
    }
    if ("text" in c && typeof c.text === "string") {
      return { ...p, ...dates, inputMode: "richtext", content: { doc: textToTipTapDoc(c.text) } };
    }
    return { ...p, ...dates, inputMode: "richtext", content: { doc: EMPTY_TIPTAP_DOC } };
  }

  const c = p.content;
  if ("editorDoc" in c && c.editorDoc !== undefined && isDoc(c.editorDoc)) {
    return {
      ...p,
      ...dates,
      inputMode: "split_editor_table",
      content: {
        editorDoc: c.editorDoc,
        columnLabels: c.columnLabels,
        rows: c.rows,
      },
    };
  }
  if ("editorText" in c && typeof c.editorText === "string") {
    return {
      ...p,
      ...dates,
      inputMode: "split_editor_table",
      content: {
        editorDoc: textToTipTapDoc(c.editorText),
        columnLabels: c.columnLabels,
        rows: c.rows,
      },
    };
  }
  return {
    ...p,
    ...dates,
    inputMode: "split_editor_table",
    content: {
      editorDoc: EMPTY_TIPTAP_DOC,
      columnLabels: c.columnLabels,
      rows: c.rows,
    },
  };
}
