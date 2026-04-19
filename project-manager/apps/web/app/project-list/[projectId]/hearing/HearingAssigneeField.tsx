"use client";

import { Button } from "@/app/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/app/components/ui/popover";
import { useMemo, useRef, useState } from "react";
import { HearingAutoTextarea } from "./HearingAutoTextarea";

const MAX_SUGGESTIONS = 24;

type HearingAssigneeFieldProps = {
  value: string;
  onValueChange: (next: string) => void;
  suggestions: string[];
  copyFromAboveDisabled: boolean;
  onCopyFromAbove: () => void;
  inputId?: string;
  inputName?: string;
};

export function HearingAssigneeField({
  value,
  onValueChange,
  suggestions,
  copyFromAboveDisabled,
  onCopyFromAbove,
  inputId,
  inputName,
}: HearingAssigneeFieldProps) {
  const [open, setOpen] = useState(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = suggestions.filter((s) => {
      const t = s.trim();
      if (!t) {
        return false;
      }
      if (q === "") {
        return true;
      }
      return t.toLowerCase().includes(q);
    });
    return list.slice(0, MAX_SUGGESTIONS);
  }, [suggestions, value]);

  const clearBlurTimer = () => {
    if (blurTimerRef.current !== null) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  };

  const handleFocus = () => {
    clearBlurTimer();
    if (suggestions.length > 0) {
      setOpen(true);
    }
  };

  const handleBlur = () => {
    clearBlurTimer();
    blurTimerRef.current = setTimeout(() => {
      setOpen(false);
      blurTimerRef.current = null;
    }, 180);
  };

  const pick = (s: string) => {
    clearBlurTimer();
    onValueChange(s);
    setOpen(false);
  };

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Popover
        open={open && filtered.length > 0}
        onOpenChange={(next) => {
          if (!next) {
            setOpen(false);
          } else if (suggestions.length > 0 && filtered.length > 0) {
            setOpen(true);
          }
        }}
      >
        <PopoverAnchor asChild>
          {/* shrink-0: flex 子が textarea 領域を縦に潰して文字が欠けるのを防ぐ */}
          <div className="block w-full min-w-0 shrink-0">
            <HearingAutoTextarea
              id={inputId}
              name={inputName}
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={4}
          className="max-h-48 min-w-[12rem] max-w-[min(24rem,calc(100vw-2rem))] overflow-y-auto p-1"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <ul className="space-y-0.5">
            {filtered.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  className="w-full rounded px-2 py-1.5 text-left text-xs leading-snug hover:bg-[color:color-mix(in_srgb,var(--foreground)_8%,transparent)]"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(s)}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-full shrink-0 px-2 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
        disabled={copyFromAboveDisabled}
        onClick={onCopyFromAbove}
      >
        上の行と同じ
      </Button>
    </div>
  );
}
