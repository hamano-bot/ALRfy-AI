"use client";

import type { Editor } from "@tiptap/core";
import { ChevronDown, Table as TableIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/app/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/components/ui/popover";
import { cn } from "@/lib/utils";

const GRID_MAX = 8;

type RequirementsTiptapTableInsertPopoverProps = {
  editor: Editor | null;
  disabled: boolean;
};

export function RequirementsTiptapTableInsertPopover({ editor, disabled }: RequirementsTiptapTableInsertPopoverProps) {
  const [open, setOpen] = useState(false);
  const [hoverRows, setHoverRows] = useState(3);
  const [hoverCols, setHoverCols] = useState(3);
  const [withHeaderRow, setWithHeaderRow] = useState(true);

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (next) {
      setHoverRows(3);
      setHoverCols(3);
      setWithHeaderRow(true);
    }
  }, []);

  const insert = useCallback(() => {
    if (!editor || disabled) {
      return;
    }
    editor.chain().focus().insertTable({ rows: hoverRows, cols: hoverCols, withHeaderRow }).run();
    setOpen(false);
  }, [editor, disabled, hoverRows, hoverCols, withHeaderRow]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 min-w-[2.75rem] shrink-0 gap-0.5 px-1.5 text-[var(--muted)]",
            open && "bg-[color:color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--foreground)]",
          )}
          disabled={disabled}
          title="表を挿入"
          aria-label="表を挿入"
        >
          <span className="inline-flex items-center gap-0.5">
            <TableIcon className="h-4 w-4" aria-hidden />
            <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto min-w-[240px] p-3">
        <div className="space-y-2">
          <div className="text-xs font-medium text-[var(--foreground)]">表を挿入（最大 {GRID_MAX}×{GRID_MAX}）</div>
          <div
            className="inline-grid gap-0.5 p-0.5"
            style={{ gridTemplateColumns: `repeat(${GRID_MAX}, minmax(0, 1fr))` }}
            onMouseLeave={() => {
              setHoverRows(3);
              setHoverCols(3);
            }}
          >
            {Array.from({ length: GRID_MAX }, (_, ri) =>
              Array.from({ length: GRID_MAX }, (_, ci) => {
                const r = ri + 1;
                const c = ci + 1;
                const active = r <= hoverRows && c <= hoverCols;
                return (
                  <button
                    key={`${ri}-${ci}`}
                    type="button"
                    className={cn(
                      "h-3 w-3 rounded-[2px] border border-[color:color-mix(in_srgb,var(--border)_80%,transparent)] transition-colors",
                      active
                        ? "bg-[color:color-mix(in_srgb,var(--accent)_35%,transparent)]"
                        : "bg-[color:color-mix(in_srgb,var(--surface)_90%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]",
                    )}
                    aria-label={`${r} 行 ${c} 列`}
                    onMouseEnter={() => {
                      setHoverRows(r);
                      setHoverCols(c);
                    }}
                    onClick={insert}
                  />
                );
              }),
            ).flat()}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--foreground)]">
            <input
              type="checkbox"
              className="rounded border-[color:color-mix(in_srgb,var(--border)_80%,transparent)]"
              checked={withHeaderRow}
              onChange={(e) => setWithHeaderRow(e.target.checked)}
            />
            先頭行をヘッダーにする
          </label>
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <span className="text-[11px] text-[var(--muted)]">
              選択: {hoverRows} × {hoverCols}
            </span>
            <Button type="button" size="sm" className="h-7 text-xs" onClick={insert} disabled={disabled}>
              挿入
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
