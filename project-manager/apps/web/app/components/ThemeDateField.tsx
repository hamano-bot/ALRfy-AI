"use client";

import JapaneseHolidays from "japanese-holidays";
import { CalendarIcon } from "lucide-react";
import { format, parse } from "date-fns";
import { ja } from "date-fns/locale";
import { type ReactNode, useId, useState } from "react";

import { Button } from "@/app/components/ui/button";
import { Calendar } from "@/app/components/ui/calendar";
import { inputBaseClassName } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/components/ui/popover";
import { cn } from "@/lib/utils";

/** 画面上の日付表記（内部値・API は `yyyy-MM-dd` のまま） */
export const THEME_DATE_DISPLAY_FORMAT = "yyyy年M月d日（E）" as const;

function parseYmd(s: string): Date | undefined {
  if (!s.trim()) {
    return undefined;
  }
  try {
    return parse(s.trim(), "yyyy-MM-dd", new Date());
  } catch {
    return undefined;
  }
}

type ThemeDateFieldProps = {
  label: ReactNode;
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  className?: string;
  /** `iso`: `yyyy-MM-dd` 1行表示（曜日なし）。既定は日本語表記。 */
  displayVariant?: "default" | "iso";
};

export function ThemeDateField({
  label,
  value,
  onChange,
  required,
  className,
  displayVariant = "default",
}: ThemeDateFieldProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const selected = parseYmd(value);

  const hasDate = Boolean(selected && !Number.isNaN(selected.getTime()));
  const display =
    hasDate && selected
      ? displayVariant === "iso"
        ? format(selected, "yyyy-MM-dd")
        : format(selected, THEME_DATE_DISPLAY_FORMAT, { locale: ja })
      : "日付を選択";

  return (
    <div className={cn("w-full min-w-0", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="default"
            id={id}
            draggable={false}
            className={cn(
              inputBaseClassName,
              "mt-1 h-auto min-h-9 w-full justify-between gap-2 text-left font-normal hover:bg-[color:color-mix(in_srgb,var(--background)_88%,black_12%)]",
              displayVariant === "iso" && "min-h-8 py-1.5",
            )}
          >
            <span
              className={cn(
                "min-w-0 flex-1 text-left leading-snug",
                displayVariant === "iso" ? "truncate whitespace-nowrap" : "whitespace-normal",
                !hasDate && "text-[var(--muted)]",
                hasDate && "text-[var(--foreground)]",
              )}
            >
              {display}
            </span>
            <CalendarIcon className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="theme-date-picker-panel w-[min(100vw-2rem,20rem)] p-3" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(d) => {
              if (d) {
                onChange(format(d, "yyyy-MM-dd"));
                setOpen(false);
              }
            }}
            modifiers={{
              sat: (d) => d.getDay() === 6,
              sun: (d) => d.getDay() === 0,
              jpHoliday: (d) => Boolean(JapaneseHolidays.isHolidayAt(d)),
            }}
            modifiersClassNames={{
              sat: "theme-dp-sat",
              sun: "theme-dp-sun",
              jpHoliday: "theme-dp-holiday",
            }}
          />
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-[color:color-mix(in_srgb,var(--border)_85%,transparent)] pt-2 text-[10px] text-[var(--muted)]">
            <span>
              <span className="font-medium text-sky-400">土</span> 土曜
            </span>
            <span>
              <span className="font-medium text-red-500">日</span> 日曜
            </span>
            <span>
              <span className="font-medium text-red-500">祝</span> 祝日・振替
            </span>
          </div>
          {!required ? (
            <Button
              type="button"
              variant="ghost"
              className="mt-2 w-full text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              日付をクリア
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
