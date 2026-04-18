"use client";

import { inputBaseClassName } from "@/app/components/ui/input";
import { cn } from "@/lib/utils";
import { type ChangeEvent, useLayoutEffect, useRef } from "react";

type HearingAutoTextareaProps = {
  value: string;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  className?: string;
  readOnly?: boolean;
};

/** 内容に合わせて高さを伸ばす（横方向リサイズは不可） */
export function HearingAutoTextarea({ value, onChange, className, readOnly }: HearingAutoTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    el.style.height = "0";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      readOnly={readOnly}
      draggable={false}
      rows={1}
      value={value}
      onChange={onChange}
      className={cn(
        inputBaseClassName,
        "h-auto min-h-8 resize-none overflow-hidden py-1.5 text-xs leading-snug",
        className,
      )}
    />
  );
}
