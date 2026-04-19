import { ResizableNodeView } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";

const requirementsImageMouseSelectKey = new PluginKey("requirementsImageMouseSelect");

export type RequirementsImageAlign = "left" | "center" | "right";
export type RequirementsImageValign = "top" | "middle" | "bottom";

function parseAlign(v: string | null): RequirementsImageAlign {
  return v === "center" || v === "right" ? v : "left";
}

function parseValign(v: string | null): RequirementsImageValign {
  return v === "middle" || v === "bottom" ? v : "top";
}

/**
 * ResizableNodeView のブロック容器は flex。横＝justifyContent、縦＝alignItems（行方向 flex）。
 * 外側に width:100% を付けないと左右寄せが視覚的に効かないことがある。
 */
export function applyRequirementsImageContainerLayout(dom: HTMLElement, node: PMNode): void {
  if (node.type.name !== "image") {
    return;
  }

  const h = parseAlign(node.attrs.dataAlign != null ? String(node.attrs.dataAlign) : null);
  const v = parseValign(node.attrs.dataValign != null ? String(node.attrs.dataValign) : null);

  const justifyContent = h === "center" ? "center" : h === "right" ? "flex-end" : "flex-start";
  const alignItems = v === "middle" ? "center" : v === "bottom" ? "flex-end" : "flex-start";

  dom.style.width = "100%";
  dom.style.boxSizing = "border-box";
  dom.style.justifyContent = justifyContent;
  dom.style.alignItems = alignItems;
}

/**
 * ResizableNodeView の外側 DOM は `posAtCoords` より `posAtDOM(container, 0)` の方が安定しやすい。
 */
function selectImageBlockOnMouseDown(view: EditorView, event: MouseEvent): boolean {
  if (!view.editable || event.button !== 0) {
    return false;
  }

  const t = event.target;

  if (!(t instanceof Element)) {
    return false;
  }

  if (t.closest("[data-resize-handle]")) {
    return false;
  }

  const { state } = view;
  const { doc } = state;

  const selectImageByCoordsOnly = (): boolean => {
    const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });

    if (!coords) {
      return false;
    }

    const $p = doc.resolve(coords.pos);

    for (let d = $p.depth; d > 0; d -= 1) {
      if ($p.node(d).type.name === "image") {
        const before = $p.before(d);

        view.dispatch(state.tr.setSelection(NodeSelection.create(doc, before)));
        view.focus();

        return true;
      }
    }

    return false;
  };

  const container = t.closest('[data-node="image"]');

  if (!(container instanceof HTMLElement)) {
    const img = t instanceof HTMLImageElement ? t : t.closest("img");

    if (!img || !view.dom.contains(img)) {
      return false;
    }

    return selectImageByCoordsOnly();
  }

  const applySelection = (anchorPos: number): boolean => {
    if (!Number.isFinite(anchorPos) || anchorPos < 0) {
      return false;
    }

    let $pos;

    try {
      $pos = doc.resolve(Math.min(anchorPos, doc.content.size));
    } catch {
      return false;
    }

    const after = $pos.nodeAfter;

    if (after?.type.name === "image") {
      view.dispatch(state.tr.setSelection(NodeSelection.create(doc, $pos.pos)));
      view.focus();

      return true;
    }

    const at = doc.nodeAt(anchorPos);

    if (at?.type.name === "image") {
      view.dispatch(state.tr.setSelection(NodeSelection.create(doc, anchorPos)));
      view.focus();

      return true;
    }

    return false;
  };

  let posAtDom: number;

  try {
    posAtDom = view.posAtDOM(container, 0);
  } catch {
    posAtDom = NaN;
  }

  if (Number.isFinite(posAtDom)) {
    if (applySelection(posAtDom)) {
      return true;
    }

    if (applySelection(posAtDom - 1)) {
      return true;
    }
  }

  return selectImageByCoordsOnly();
}

/**
 * 既定の Image + resize は読み込み前に非表示にするが、**外側コンテナ**に `pointer-events: none` を付けると
 * 角のリサイズハンドルも無効になる。読み込み待ちは **img 要素のみ** opacity / pointer-events で行う。
 *
 * ブロックのドラッグ移動（ドラッグハンドル／エディタ内 DnD）にはノード spec の `draggable: true` が必要。
 * ネイティブの画像ドラッグだけ `img` 要素で `draggable = false` にして抑止する。
 * mousedown での NodeSelection はプラグインで処理（`preventDefault` しない／ドラッグ開始を阻害しない）。
 */
export const RequirementsImage = Image.extend({
  priority: 1000,
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      dataAlign: {
        default: "left" as RequirementsImageAlign,
        parseHTML: (element) => parseAlign(element.getAttribute("data-align")),
        renderHTML: (attributes) => {
          const a = attributes.dataAlign as RequirementsImageAlign | undefined;
          if (!a || a === "left") {
            return {};
          }
          return { "data-align": a };
        },
      },
      dataValign: {
        default: "top" as RequirementsImageValign,
        parseHTML: (element) => parseValign(element.getAttribute("data-valign")),
        renderHTML: (attributes) => {
          const v = attributes.dataValign as RequirementsImageValign | undefined;
          if (!v || v === "top") {
            return {};
          }
          return { "data-valign": v };
        },
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: requirementsImageMouseSelectKey,
        props: {
          handleDOMEvents: {
            mousedown: (view, event) => {
              if (!(event instanceof MouseEvent)) {
                return false;
              }

              return selectImageBlockOnMouseDown(view, event);
            },
          },
        },
      }),
    ];
  },
  addNodeView() {
    if (!this.options.resize || !this.options.resize.enabled || typeof document === "undefined") {
      return null;
    }

    const { directions, minWidth, minHeight, alwaysPreserveAspectRatio } = this.options.resize;

    return ({ node, getPos, HTMLAttributes, editor }) => {
      const el = document.createElement("img");
      el.draggable = false;

      Object.entries(HTMLAttributes).forEach(([key, value]) => {
        if (value != null) {
          switch (key) {
            case "width":
            case "height":
              break;
            default:
              el.setAttribute(key, String(value));
              break;
          }
        }
      });

      el.src = HTMLAttributes.src ?? "";

      const ext = this;

      const nodeView = new ResizableNodeView({
        element: el,
        editor,
        node,
        getPos,
        onResize: (width, height) => {
          el.style.width = `${width}px`;
          el.style.height = `${height}px`;
        },
        onCommit: (width, height) => {
          const pos = getPos();
          if (pos === undefined) {
            return;
          }
          ext.editor.chain().setNodeSelection(pos).updateAttributes(ext.name, { width, height }).run();
        },
        onUpdate: (updatedNode) => updatedNode.type === node.type,
        options: {
          directions,
          min: {
            width: minWidth,
            height: minHeight,
          },
          preserveAspectRatio: alwaysPreserveAspectRatio === true,
          className: {
            container: "requirements-tiptap-image-host",
          },
        },
      });

      const dom = nodeView.dom as HTMLElement;

      applyRequirementsImageContainerLayout(dom, node);

      const originalUpdate = nodeView.update.bind(nodeView);

      nodeView.update = (updatedNode, decorations, innerDecorations) => {
        const ok = originalUpdate(updatedNode, decorations, innerDecorations);

        if (ok) {
          applyRequirementsImageContainerLayout(dom, updatedNode);
        }

        return ok;
      };

      /** 読み込み前の操作不能を img のみに限定（外側 dom に付けるとリサイズハンドルも無効になる） */
      let revealed = false;
      let revealFallbackTimeout: ReturnType<typeof setTimeout> | undefined;

      const reveal = () => {
        if (revealed) {
          return;
        }
        revealed = true;
        if (revealFallbackTimeout !== undefined) {
          clearTimeout(revealFallbackTimeout);
          revealFallbackTimeout = undefined;
        }
        el.style.opacity = "";
        el.style.pointerEvents = "";
      };

      el.style.opacity = "0";
      el.style.pointerEvents = "none";

      el.addEventListener("load", reveal, { once: true });
      el.addEventListener("error", reveal, { once: true });

      if (el.complete) {
        queueMicrotask(reveal);
      }

      revealFallbackTimeout = setTimeout(reveal, 4000);

      return nodeView;
    };
  },
});
