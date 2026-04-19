"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/app/components/ui/tooltip";
import { extractHttpsUrlsInOrder } from "@/lib/hearing-extract-https-urls";
import { cn } from "@/lib/utils";
import { Paperclip } from "lucide-react";

/** 回答欄の URL クリップ・鉛筆など、行内の小さなアイコンボタン共通（Excel 出力ボタンと同系の前景色・ホバー） */
export const hearingInlineIconButtonClassName =
  "inline-flex shrink-0 items-center justify-center rounded p-0.5 text-[var(--foreground)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--surface)_84%,black_16%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

type HearingUrlClipRowProps = {
  text: string;
  className?: string;
};

export function HearingUrlClipRow({ text, className }: HearingUrlClipRowProps) {
  const urls = extractHttpsUrlsInOrder(text);
  if (urls.length === 0) {
    return null;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn("flex shrink-0 flex-wrap items-center gap-0.5 pt-0.5", className)}
        role="group"
        aria-label="本文内のリンク"
      >
        {urls.map((url, index) => (
          <Tooltip key={url}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={hearingInlineIconButtonClassName}
                aria-label={
                  urls.length > 1
                    ? `別タブでリンクを開く（${index + 1}/${urls.length}）`
                    : "別タブでリンクを開く"
                }
                onClick={() => {
                  window.open(url, "_blank", "noopener,noreferrer");
                }}
              >
                <Paperclip className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[min(28rem,calc(100vw-2rem))] break-all font-mono text-[11px] leading-snug">
              {url}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
