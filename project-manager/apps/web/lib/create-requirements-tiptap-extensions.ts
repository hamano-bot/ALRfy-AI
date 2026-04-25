import type { AnyExtension } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import NodeRange from "@tiptap/extension-node-range";
import { RequirementsDragHandle } from "@/lib/tiptap-requirements-drag-handle";
import { RequirementsSlashExtension } from "@/lib/tiptap-requirements-slash-extension";
import { RequirementsBulletList } from "@/lib/tiptap-requirements-bullet-list";
import { RequirementsOrderedList } from "@/lib/tiptap-requirements-ordered-list";
import { RequirementsColumn, RequirementsColumns } from "@/lib/tiptap-requirements-columns";
import { RequirementsImage } from "@/lib/tiptap-requirements-image";
import { RequirementsTable } from "@/lib/tiptap-requirements-table";
import { RequirementsRawHtmlBlock } from "@/lib/tiptap-requirements-raw-html-block";

/**
 * 要件エディタ本体・テンプレプレビューで共通の TipTap 拡張セット。
 */
export function createRequirementsTiptapExtensions(placeholder: string): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      bulletList: false,
      orderedList: false,
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          class: null,
          target: null,
          rel: null,
        },
      },
    }),
    TextStyle,
    Color.configure({ types: ["textStyle"] }),
    FontFamily.configure({ types: ["textStyle"] }),
    FontSize.configure({ types: ["textStyle"] }),
    TextAlign.configure({
      types: ["paragraph", "heading", "blockquote"],
      alignments: ["left", "center", "right", "justify"],
      defaultAlignment: null,
    }),
    RequirementsBulletList,
    RequirementsOrderedList,
    RequirementsTable.configure({
      resizable: true,
      HTMLAttributes: {
        class: "requirements-tiptap-table",
        cellSpacing: 0,
        cellPadding: 0,
      },
    }),
    TableRow,
    TableHeader.configure({
      HTMLAttributes: {
        class: "requirements-tiptap-table-header-cell",
      },
    }),
    TableCell.configure({
      HTMLAttributes: {
        class: "requirements-tiptap-table-cell",
      },
    }),
    NodeRange,
    RequirementsDragHandle,
    RequirementsSlashExtension,
    RequirementsColumn,
    RequirementsColumns,
    RequirementsImage.configure({
      inline: false,
      allowBase64: false,
      resize: {
        enabled: true,
        minWidth: 80,
        minHeight: 48,
        alwaysPreserveAspectRatio: true,
      },
      HTMLAttributes: {
        class: "requirements-tiptap-image",
      },
    }),
    RequirementsRawHtmlBlock,
    Placeholder.configure({ placeholder }),
  ];
}
