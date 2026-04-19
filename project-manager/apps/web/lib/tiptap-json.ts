import type { JSONContent } from "@tiptap/core";

/** StarterKit で有効な空ドキュメント */
export const EMPTY_TIPTAP_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

/** プレーンテキスト（旧保存）を TipTap の doc に変換（改行で段落分け） */
export function textToTipTapDoc(text: string): JSONContent {
  if (!text.trim()) {
    return EMPTY_TIPTAP_DOC;
  }
  const lines = text.split(/\n/);
  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph",
      content: line.length > 0 ? [{ type: "text", text: line }] : [],
    })),
  };
}
