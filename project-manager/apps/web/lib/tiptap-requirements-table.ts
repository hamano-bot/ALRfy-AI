import type { CommandProps, Editor } from "@tiptap/core";
import { mergeAttributes } from "@tiptap/core";
import { Table, TableView, createColGroup, type TableOptions } from "@tiptap/extension-table";
import type { DOMOutputSpec, Node as PmNode, ResolvedPos } from "@tiptap/pm/model";
import { CellSelection } from "@tiptap/pm/tables";
import { NodeSelection, type EditorState } from "@tiptap/pm/state";

/** 表全体の罫線プリセット（辺単位編集はしない） */
export const REQUIREMENTS_TABLE_BORDER_PRESETS = [
  "default",
  "none",
  "dashed",
  "thick",
  "header_double",
  "row_col_double",
] as const;

export type RequirementsTableBorderPreset = (typeof REQUIREMENTS_TABLE_BORDER_PRESETS)[number];

function isPreset(value: string | null): value is RequirementsTableBorderPreset {
  return value !== null && (REQUIREMENTS_TABLE_BORDER_PRESETS as readonly string[]).includes(value);
}

/** getHTML / 貼り付け用に table 要素へ必ず書き出す（Table の renderHTML が属性マージに含めないケースへの対策） */
function borderPresetDataAttrs(borderPreset: unknown): Record<string, string> {
  const raw = typeof borderPreset === "string" ? borderPreset : undefined;
  const p = raw && isPreset(raw) ? raw : "default";
  if (p === "none") {
    return {
      "data-requirements-table-border-preset": "none",
      "data-requirements-table-borders": "off",
    };
  }
  if (p === "default") {
    return {
      "data-requirements-table-border-preset": "default",
      "data-requirements-table-borders": "on",
    };
  }
  return {
    "data-requirements-table-border-preset": p,
    "data-requirements-table-borders": "on",
  };
}

/** resizable 時は TableView が table を生成するため、罫線プリセットを DOM に同期する */
function syncRequirementsTableDom(table: HTMLTableElement, node: PmNode) {
  const raw = node.attrs.borderPreset as string | undefined;
  const preset = raw && isPreset(raw) ? raw : "default";
  table.setAttribute("data-requirements-table-border-preset", preset);
  table.setAttribute("data-requirements-table-borders", preset === "none" ? "off" : "on");
  table.classList.add("requirements-tiptap-table");
}

class RequirementsTableView extends TableView {
  constructor(node: PmNode, cellMinWidth: number) {
    super(node, cellMinWidth);
    syncRequirementsTableDom(this.table, node);
  }

  update(node: PmNode): boolean {
    const ok = super.update(node);
    if (ok) {
      syncRequirementsTableDom(this.table, node);
    }
    return ok;
  }
}

export function findParentTable(state: EditorState): { pos: number; node: PmNode } | null {
  const sel = state.selection;
  if (sel instanceof NodeSelection && sel.node.type.name === "table") {
    return { pos: sel.from, node: sel.node };
  }
  /** セル複数選択時は $from が表を拾えないことがあるため $anchorCell も試す */
  const candidates: ResolvedPos[] =
    sel instanceof CellSelection ? [sel.$anchorCell, sel.$headCell] : [sel.$from, sel.$anchor, sel.$head];
  const seen = new Set<number>();
  for (const $pos of candidates) {
    if (!$pos || seen.has($pos.pos)) {
      continue;
    }
    seen.add($pos.pos);
    for (let d = $pos.depth; d > 0; d -= 1) {
      const node = $pos.node(d);
      if (node.type.name === "table") {
        return { pos: $pos.before(d), node };
      }
    }
  }
  return null;
}

/** BubbleMenu 等から型安全に呼ぶ（Commands の declare merge を避ける） */
export function getTableBorderPresetFromEditor(editor: Editor): RequirementsTableBorderPreset | null {
  const found = findParentTable(editor.state);
  if (!found) {
    return null;
  }
  const raw = found.node.attrs.borderPreset as string | undefined;
  if (raw && isPreset(raw)) {
    return raw;
  }
  return "default";
}

export function runSetTableBorderPreset(editor: Editor, preset: RequirementsTableBorderPreset): boolean {
  return editor
    .chain()
    .focus()
    .command(({ state, dispatch }) => {
      const found = findParentTable(state);
      if (!found) {
        return false;
      }
      const next = isPreset(preset) ? preset : "default";
      if (dispatch) {
        const { pos, node } = found;
        dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, borderPreset: next }));
      }
      return true;
    })
    .run();
}

export const RequirementsTable = Table.extend({
  addOptions(): TableOptions {
    const parent = this.parent?.() as TableOptions;
    return {
      ...parent,
      View: RequirementsTableView,
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const { colgroup, tableWidth, tableMinWidth } = createColGroup(node, this.options.cellMinWidth);
    const userStyles = HTMLAttributes.style as string | undefined;

    function getTableStyle() {
      if (userStyles) {
        return userStyles;
      }
      return tableWidth ? `width: ${tableWidth}` : `min-width: ${tableMinWidth}`;
    }

    const presetAttrs = borderPresetDataAttrs(node.attrs.borderPreset);
    const table: DOMOutputSpec = [
      "table",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, presetAttrs, {
        style: getTableStyle(),
      }),
      colgroup,
      ["tbody", 0],
    ];

    return this.options.renderWrapper ? (["div", { class: "tableWrapper" }, table] as DOMOutputSpec) : table;
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      borderPreset: {
        default: "default" satisfies RequirementsTableBorderPreset,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-requirements-table-border-preset");
          if (raw && isPreset(raw)) {
            return raw;
          }
          return "default";
        },
        renderHTML: (attributes) => {
          const preset = (attributes.borderPreset as string | undefined) ?? "default";
          const p = isPreset(preset) ? preset : "default";
          if (p === "default") {
            return {
              "data-requirements-table-border-preset": "default",
              "data-requirements-table-borders": "on",
            };
          }
          return {
            "data-requirements-table-border-preset": p,
            "data-requirements-table-borders": p === "none" ? "off" : "on",
          };
        },
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setTableBorderPreset:
        (preset: RequirementsTableBorderPreset) =>
        ({ state, dispatch }: CommandProps) => {
          const found = findParentTable(state);
          if (!found) {
            return false;
          }
          const next = isPreset(preset) ? preset : "default";
          if (dispatch) {
            const { pos, node } = found;
            dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, borderPreset: next }));
          }
          return true;
        },
    };
  },
});
