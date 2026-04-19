import type { Editor } from "@tiptap/core";

export function duplicateBlock(editor: Editor): boolean {
  const { state } = editor;
  const $from = state.selection.$from;
  if ($from.depth < 1) {
    return false;
  }
  const start = $from.before(1);
  const end = $from.after(1);
  const slice = state.doc.slice(start, end);
  const tr = state.tr.insert(end, slice.content);
  editor.view.dispatch(tr);
  return true;
}

export function deleteBlock(editor: Editor): boolean {
  const { state } = editor;
  const $from = state.selection.$from;
  if ($from.depth < 1) {
    return false;
  }
  const start = $from.before(1);
  const end = $from.after(1);
  if (state.doc.childCount <= 1) {
    return editor.chain().focus().clearContent().run();
  }
  const tr = state.tr.delete(start, end);
  editor.view.dispatch(tr);
  return true;
}

export function insertParagraphBefore(editor: Editor): boolean {
  const { state } = editor;
  const $from = state.selection.$from;
  if ($from.depth < 1) {
    return false;
  }
  const start = $from.before(1);
  const p = state.schema.nodes.paragraph.create();
  const tr = state.tr.insert(start, p);
  editor.view.dispatch(tr);
  return true;
}

export function insertParagraphAfter(editor: Editor): boolean {
  const { state } = editor;
  const $from = state.selection.$from;
  if ($from.depth < 1) {
    return false;
  }
  const end = $from.after(1);
  const p = state.schema.nodes.paragraph.create();
  const tr = state.tr.insert(end, p);
  editor.view.dispatch(tr);
  return true;
}
