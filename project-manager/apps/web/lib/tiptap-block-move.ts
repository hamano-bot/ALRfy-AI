import type { Editor } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";

/**
 * ドキュメント直下のブロック同士を入れ替え（WordPress のブロック上下移動に相当）。
 * ネストしたリスト内などは、カーソルが属する最上位ブロック単位で動く。
 */
export function moveBlockVertically(editor: Editor, dir: "up" | "down"): boolean {
  const { state } = editor;
  const { doc, selection } = state;
  const $from = selection.$from;
  if ($from.depth < 1) {
    return false;
  }

  const index = $from.index(0);
  const delta = dir === "up" ? -1 : 1;
  const newIndex = index + delta;
  if (newIndex < 0 || newIndex >= doc.childCount) {
    return false;
  }

  if (delta === -1) {
    const a = doc.child(index - 1);
    const b = doc.child(index);
    let start = 0;
    for (let i = 0; i < index - 1; i++) {
      start += doc.child(i).nodeSize;
    }
    const tr = state.tr.replaceWith(start, start + a.nodeSize + b.nodeSize, Fragment.from([b, a]));
    editor.view.dispatch(tr);
    return true;
  }

  const a = doc.child(index);
  const b = doc.child(index + 1);
  let start = 0;
  for (let i = 0; i < index; i++) {
    start += doc.child(i).nodeSize;
  }
  const tr = state.tr.replaceWith(start, start + a.nodeSize + b.nodeSize, Fragment.from([b, a]));
  editor.view.dispatch(tr);
  return true;
}
