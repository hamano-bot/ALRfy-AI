import type { JSONContent } from "@tiptap/core";

export type RequirementsInputMode = "richtext" | "table" | "split_editor_table";

export type RequirementsPageContentRichtext = {
  doc: JSONContent;
};

export type RequirementsTableRow = {
  id: string;
  cells: [string, string, string];
};

export type RequirementsPageContentTable = {
  columnLabels: [string, string, string];
  rows: RequirementsTableRow[];
};

/** 5/8 エディタ + 3/8 表（A4横1枚のイメージ。レイアウトは CSS で再現） */
export type RequirementsPageContentSplit = {
  editorDoc: JSONContent;
  columnLabels: [string, string, string];
  rows: RequirementsTableRow[];
};

type RequirementsPageBase = {
  id: string;
  pageType: string;
  title: string;
  createdOn: string | null;
  updatedOn: string | null;
  is_fixed: boolean;
  deleted: boolean;
};

export type RequirementsPage =
  | (RequirementsPageBase & { inputMode: "richtext"; content: RequirementsPageContentRichtext })
  | (RequirementsPageBase & { inputMode: "table"; content: RequirementsPageContentTable })
  | (RequirementsPageBase & { inputMode: "split_editor_table"; content: RequirementsPageContentSplit });

export type RequirementsDocBody = {
  schema_version?: number;
  pages: RequirementsPage[];
};
