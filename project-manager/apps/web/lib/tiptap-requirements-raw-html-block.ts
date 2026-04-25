import { Node, mergeAttributes } from "@tiptap/core";
import { sanitizeRequirementsRawHtml } from "@/lib/requirements-html-sanitize";

/**
 * HTMLソースモードから適用した原文HTMLを保持・描画するためのブロックノード。
 * 通常のHTMLパースでは失われる style / 独自構造をそのまま表示する。
 */
export const RequirementsRawHtmlBlock = Node.create({
  name: "requirementsRawHtmlBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      html: {
        default: "",
      },
    };
  },

  parseHTML() {
    return [{ tag: "requirements-raw-html-block" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "requirements-raw-html-block",
      mergeAttributes(HTMLAttributes, {
        "data-raw-html": "1",
      }),
    ];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const outer = document.createElement("div");
      outer.className = "requirements-raw-html-host";
      outer.setAttribute("data-node", "requirements-raw-html-block");
      const EDITABLE_SELECTOR = ".card-body, .header-item";
      let lastCommittedHtml = "";

      const applyEditableBehavior = (host: HTMLElement) => {
        host.querySelectorAll<HTMLElement>(EDITABLE_SELECTOR).forEach((el) => {
          el.contentEditable = "true";
          el.spellcheck = false;
          el.setAttribute("data-raw-text-editable", "1");

          el.addEventListener("beforeinput", (ev) => {
            const ie = ev as InputEvent;
            // 構造変更を抑止し、テキスト編集のみ許可
            if (ie.inputType === "insertParagraph" || ie.inputType === "insertLineBreak") {
              ev.preventDefault();
            }
          });
          el.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") {
              ev.preventDefault();
            }
          });
          el.addEventListener("paste", (ev) => {
            ev.preventDefault();
            const text = ev.clipboardData?.getData("text/plain") ?? "";
            document.execCommand("insertText", false, text);
          });
        });
      };

      const commitAttrsHtml = () => {
        const safe = sanitizeRequirementsRawHtml(outer.innerHTML);
        if (safe === "" || safe === lastCommittedHtml) {
          return;
        }
        let pos: number | undefined;
        try {
          pos = typeof getPos === "function" ? getPos() : undefined;
        } catch {
          return;
        }
        if (typeof pos !== "number" || pos < 0) {
          return;
        }
        const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          html: safe,
        });
        editor.view.dispatch(tr);
        lastCommittedHtml = safe;
      };

      const setHostHtml = (html: string) => {
        outer.innerHTML = html;
        applyEditableBehavior(outer);
      };

      const html = typeof node.attrs.html === "string" ? node.attrs.html : "";
      lastCommittedHtml = html;
      setHostHtml(html);
      outer.addEventListener("input", commitAttrsHtml);
      outer.addEventListener("blur", commitAttrsHtml, true);

      return {
        dom: outer,
        update: (updatedNode) => {
          if (updatedNode.type.name !== this.name) {
            return false;
          }
          const next = typeof updatedNode.attrs.html === "string" ? updatedNode.attrs.html : "";
          if (outer.innerHTML !== next) {
            lastCommittedHtml = next;
            setHostHtml(next);
          }
          return true;
        },
        destroy: () => {
          outer.removeEventListener("input", commitAttrsHtml);
          outer.removeEventListener("blur", commitAttrsHtml, true);
        },
      };
    };
  },
});

