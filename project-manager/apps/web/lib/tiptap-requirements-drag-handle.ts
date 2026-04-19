import DragHandle from "@tiptap/extension-drag-handle";

/** Lucide `GripVertical` と同じ 6 点グリップ（DOM 用・SVG 文字列） */
const GRIP_VERTICAL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;

export const RequirementsDragHandle = DragHandle.configure({
  render() {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "requirements-tiptap-drag-handle";
    el.setAttribute("tabindex", "-1");
    el.setAttribute("contenteditable", "false");
    el.setAttribute("aria-label", "ブロックをドラッグして移動");
    el.title = "ドラッグして移動";
    el.innerHTML = GRIP_VERTICAL_SVG;
    return el;
  },
});
