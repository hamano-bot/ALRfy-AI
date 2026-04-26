"use client";

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ScrollPanelProps = HTMLAttributes<HTMLDivElement>;

/**
 * テーマ統一済みの縦スクロール領域。
 * 新規画面では本コンポーネントを使い、スクロール見た目の差分をなくす。
 */
export function ScrollPanel({ className, ...props }: ScrollPanelProps) {
  return <div className={cn("modern-scrollbar min-h-0 overflow-y-auto overflow-x-hidden", className)} {...props} />;
}

