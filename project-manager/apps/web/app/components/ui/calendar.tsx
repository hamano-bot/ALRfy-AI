"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { DayPicker, type DayPickerProps } from "react-day-picker";
import { ja } from "date-fns/locale";

import { cn } from "@/lib/utils";

import "react-day-picker/style.css";

export type CalendarProps = DayPickerProps;

/** react-day-picker をダッシュボードの CSS 変数に合わせたラッパー（shadcn Calendar 相当） */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components: userComponents,
  weekStartsOn = 0,
  locale = ja,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      {...props}
      showOutsideDays={showOutsideDays}
      weekStartsOn={weekStartsOn}
      locale={locale}
      className={cn("theme-dp-root mx-auto max-w-full p-0", className)}
      classNames={classNames}
      components={{
        Chevron: ({ className: chClass, orientation }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
          return <Icon className={cn("h-4 w-4 text-[var(--foreground)]", chClass)} aria-hidden />;
        },
        ...userComponents,
      }}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
