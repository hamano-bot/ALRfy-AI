"use client";

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { List } from "lucide-react";

type OutlineHeading = { level: number; text: string; pos: number };

export function RequirementsTiptapOutline({ editor }: { editor: Editor | null }) {
  const headings = useEditorState({
    editor,
    selector: ({ editor: ed, transactionNumber }) => {
      if (!ed) {
        return [] as OutlineHeading[];
      }
      void transactionNumber;
      const out: OutlineHeading[] = [];
      ed.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading") {
          const level = node.attrs.level as number;
          const text = node.textContent.trim();
          out.push({ level, text: text || "（無題）", pos });
        }
        return true;
      });
      return out;
    },
  });

  if (!editor || headings === null) {
    return null;
  }

  return (
    <aside
      className="flex w-full shrink-0 flex-col border-b border-[color:color-mix(in_srgb,var(--border)_80%,transparent)] bg-[color:color-mix(in_srgb,var(--surface-soft)_35%,transparent)] py-2 sm:w-[200px] sm:border-b-0 sm:border-r"
      aria-label="目次（見出し）"
    >
      <div className="flex items-center gap-1.5 px-2 pb-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
        <List className="h-3.5 w-3.5" aria-hidden />
        目次
      </div>
      <nav className="max-h-[min(40vh,320px)] overflow-y-auto px-1">
        {headings.length === 0 ? (
          <p className="px-2 py-1.5 text-[10px] leading-snug text-[var(--muted)]">見出しがありません。</p>
        ) : (
          <ul className="space-y-0.5">
            {headings.map((h, i) => (
              <li key={`${h.pos}-${i}`}>
                <button
                  type="button"
                  className="w-full rounded px-2 py-1 text-left text-xs text-[var(--muted)] hover:bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)] hover:text-[var(--foreground)]"
                  style={{ paddingLeft: `${8 + (h.level - 1) * 10}px` }}
                  onClick={() => {
                    editor.chain().focus().setTextSelection(h.pos + 1).scrollIntoView().run();
                  }}
                >
                  <span className="text-[10px] text-[var(--muted)]">H{h.level}</span>{" "}
                  <span className="text-[var(--foreground)]">{h.text}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </aside>
  );
}
