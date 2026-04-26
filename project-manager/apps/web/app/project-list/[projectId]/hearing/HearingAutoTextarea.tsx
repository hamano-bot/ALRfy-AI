"use client";

import { inputBaseClassName } from "@/app/components/ui/input";
import { cn } from "@/lib/utils";
import { type ChangeEvent, type FocusEvent, useLayoutEffect, useRef } from "react";

type HearingAutoTextareaProps = {
  value: string;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  className?: string;
  readOnly?: boolean;
  /** readOnly より強く編集・フォーカスを抑止（下書きロック等） */
  disabled?: boolean;
  onFocus?: (e: FocusEvent<HTMLTextAreaElement>) => void;
  onBlur?: (e: FocusEvent<HTMLTextAreaElement>) => void;
  id?: string;
  name?: string;
  autoComplete?: string;
};

/** 内容に合わせて高さを伸ばす（横方向リサイズは不可）。列幅変化による折り返し変化にも追従する。 */
export function HearingAutoTextarea({
  value,
  onChange,
  className,
  readOnly,
  disabled,
  onFocus,
  onBlur,
  id,
  name,
  autoComplete = "off",
}: HearingAutoTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const measure = () => {
      el.style.height = "auto";
      const next = Math.ceil(el.scrollHeight);
      el.style.height = `${next}px`;
    };
    measure();
    let rafOuter = 0;
    let rafInner = 0;
    rafOuter = requestAnimationFrame(() => {
      rafInner = requestAnimationFrame(measure);
    });

    const ro = new ResizeObserver(() => {
      measure();
    });
    const parent = el.parentElement;
    if (parent) {
      ro.observe(parent);
    } else {
      ro.observe(el);
    }

    return () => {
      cancelAnimationFrame(rafOuter);
      cancelAnimationFrame(rafInner);
      ro.disconnect();
    };
  }, [value, disabled]);

  return (
    <textarea
      ref={ref}
      id={id}
      name={name}
      autoComplete={autoComplete}
      readOnly={readOnly}
      disabled={disabled}
      draggable={false}
      rows={1}
      value={value}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        inputBaseClassName,
        // inputBaseClassName の flex/h-9 は textarea の scrollHeight と相性が悪いので block + h-auto で上書きする
        "block h-auto max-h-none min-h-8 w-full resize-none overflow-hidden py-1.5 text-xs leading-snug",
        className,
      )}
    />
  );
}
