"use client";

import { Briefcase, CalendarDays, FileText } from "lucide-react";
import type { ReactNode } from "react";

type PortalAppIconProps = {
  appKey: string;
  /** Inner icon / glyph size (e.g. h-5 w-5). Sidebar uses h-3.5 w-3.5. */
  className?: string;
};

/**
 * ポータル `app_key` 用アイコン（サイドバー・アプリカード共通）。
 */
export function PortalAppIcon({ appKey, className = "h-5 w-5" }: PortalAppIconProps): ReactNode {
  const cn = `${className} shrink-0`;
  if (appKey === "project-manager") {
    return <Briefcase className={cn} aria-hidden />;
  }
  if (appKey === "minutes-record") {
    return <CalendarDays className={cn} aria-hidden />;
  }
  if (appKey === "estimate-manager") {
    return <FileText className={cn} aria-hidden />;
  }
  const letter = appKey.trim().slice(0, 1);
  return (
    <span
      className={`flex ${className} shrink-0 items-center justify-center rounded-md border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] text-[11px] font-semibold text-[var(--foreground)]`}
      aria-hidden
    >
      {letter ? letter.toUpperCase() : "?"}
    </span>
  );
}
