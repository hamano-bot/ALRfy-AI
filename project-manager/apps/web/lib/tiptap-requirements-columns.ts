import type { Editor } from "@tiptap/core";
import { mergeAttributes, Node } from "@tiptap/core";

/** 1 カラム（親は requirementsColumns のみ） */
export const RequirementsColumn = Node.create({
  name: "requirementsColumn",
  group: "requirementsColumn",
  content: "block+",
  isolating: true,
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="requirements-column"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "requirements-column",
        class: "requirements-tiptap-column",
      }),
      0,
    ];
  },
});

/** 2〜3 カラムの行 */
export const RequirementsColumns = Node.create({
  name: "requirementsColumns",
  group: "block",
  content: "requirementsColumn{2,3}",
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="requirements-columns"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const n = node.childCount;
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "requirements-columns",
        "data-columns": String(n),
        class: `requirements-tiptap-columns requirements-tiptap-columns--${n}`,
      }),
      0,
    ];
  },
});

/**
 * チェーンにカスタムコマンドが載らない環境でも動くよう、`insertContent` で挿入する。
 */
export function insertRequirementsColumns(editor: Editor, cols: 2 | 3): boolean {
  const content = Array.from({ length: cols }, () => ({
    type: "requirementsColumn" as const,
    content: [{ type: "paragraph" as const }],
  }));
  return editor
    .chain()
    .focus()
    .insertContent({
      type: "requirementsColumns",
      content,
    })
    .run();
}
