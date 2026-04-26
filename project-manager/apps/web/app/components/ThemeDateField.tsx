"use client";

import JapaneseHolidays from "japanese-holidays";
import { CalendarIcon } from "lucide-react";
import { format, parse } from "date-fns";
import { type ReactNode, useId, useState } from "react";

import { Button } from "@/app/components/ui/button";
import { Calendar } from "@/app/components/ui/calendar";
import { inputBaseClassName } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/components/ui/popover";
import { cn } from "@/lib/utils";

/** 画面上の日付表記（内部値・API とも **YYYY-MM-DD** に統一） */
export const THEME_DATE_DISPLAY_FORMAT = "yyyy-MM-dd" as const;

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
  /** 閲覧のみ・ロック時など */
  disabled?: boolean;
  className?: string;
  /** 複数行で安定した id を付与するとき（省略時は内部 useId） */
  controlId?: string;
  /** フォーム監査・オートフィル用の name（任意） */
  name?: string;
  /** カレンダーパネル下に「今日」ボタンを表示する（既定: true） */
  showTodayButton?: boolean;
};

export function ThemeDateField({
  label,
  value,
  onChange,
  required,
  disabled = false,
  className,
  controlId: controlIdProp,
  name,
  showTodayButton = true,
}: ThemeDateFieldProps) {
  const generatedId = useId();
  const id = controlIdProp ?? generatedId;
  const [open, setOpen] = useState(false);
  const selected = parseYmd(value);

  const hasDate = Boolean(selected && !Number.isNaN(selected.getTime()));
  const display = hasDate && selected ? format(selected, THEME_DATE_DISPLAY_FORMAT) : "日付を選択";

  return (
    <div className={cn("w-full min-w-0", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Popover open={open && !disabled} onOpenChange={(o) => !disabled && setOpen(o)}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="default"
            id={id}
            name={name}
            draggable={false}
            disabled={disabled}
            className={cn(
              inputBaseClassName,
              "mt-1 h-9 min-h-9 w-full shrink-0 justify-between gap-2 px-3 py-2 text-left font-normal tabular-nums hover:bg-[color:color-mix(in_srgb,var(--background)_88%,black_12%)]",
              "font-mono text-sm leading-none tracking-normal",
            )}
          >
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-left",
                !hasDate && "text-[var(--muted)]",
                hasDate && "text-[var(--foreground)]",
              )}
            >
              {display}
            </span>
            <CalendarIcon className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="theme-date-picker-panel w-[min(100vw-2rem,20rem)] px-3 pt-3 pb-2"
          align="start"
        >
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
          {showTodayButton ? (
            <Button
              type="button"
              variant="ghost"
              className="mt-1.5 w-full text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
              onClick={() => {
                onChange(format(new Date(), "yyyy-MM-dd"));
                setOpen(false);
              }}
            >
              今日
            </Button>
          ) : null}
          {!required ? (
            <Button
              type="button"
              variant="ghost"
              className="mt-1.5 w-full text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
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
