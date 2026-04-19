"use client";

import type { Editor } from "@tiptap/core";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SLASH_EXIT_EVENT, SLASH_EVENT, type SlashMenuItem } from "@/lib/tiptap-requirements-slash-extension";

type SlashMenuState = {
  editor: Editor;
  items: SlashMenuItem[];
  command: (item: SlashMenuItem) => void;
  clientRect: (() => DOMRect | null) | null | undefined;
};

export function RequirementsTiptapSlashMenu() {
  const [state, setState] = useState<SlashMenuState | null>(null);

  useEffect(() => {
    const onSlash = (e: Event) => {
      const d = (e as CustomEvent).detail as SlashMenuState;
      setState(d);
    };
    const onExit = () => setState(null);
    window.addEventListener(SLASH_EVENT, onSlash);
    window.addEventListener(SLASH_EXIT_EVENT, onExit);
    return () => {
      window.removeEventListener(SLASH_EVENT, onSlash);
      window.removeEventListener(SLASH_EXIT_EVENT, onExit);
    };
  }, []);

  if (typeof document === "undefined" || !state) {
    return null;
  }

  const rect = state.clientRect?.() ?? null;
  if (!rect) {
    return null;
  }

  const top = rect.bottom + 4;
  const left = rect.left;

  return createPortal(
    <div
      role="listbox"
      aria-label="スラッシュコマンド"
      className="fixed z-[200] max-h-[min(60vh,320px)] w-[min(100vw-2rem,280px)] overflow-y-auto rounded-lg border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[var(--surface)] py-1 text-sm shadow-lg ring-1 ring-[color:color-mix(in_srgb,var(--accent)_22%,transparent)]"
      style={{ top, left }}
    >
      {state.items.length === 0 ? (
        <p className="px-3 py-2 text-xs text-[var(--muted)]">一致するブロックがありません</p>
      ) : (
        state.items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="option"
            className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-[var(--foreground)] hover:bg-[color:color-mix(in_srgb,var(--surface-soft)_90%,transparent)]"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              state.command(item);
              setState(null);
            }}
          >
            <span className="font-medium">{item.label}</span>
            {item.description ? <span className="text-[10px] text-[var(--muted)]">{item.description}</span> : null}
          </button>
        ))
      )}
    </div>,
    document.body,
  );
}
