import { cn } from "@/lib/utils";

const GEMINI_SVG_SRC = "/brand/gemini-color.svg";

/** Gemini 連携ボタン用（`public/brand/gemini-color.svg`） */
export function GeminiMarkIcon({ className }: { className?: string }) {
  return (
    <img
      src={GEMINI_SVG_SRC}
      alt=""
      width={16}
      height={16}
      decoding="async"
      draggable={false}
      className={cn("h-4 w-4 shrink-0 object-contain", className)}
      aria-hidden
    />
  );
}
