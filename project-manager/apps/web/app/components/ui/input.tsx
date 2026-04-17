import * as React from "react";

import { cn } from "@/lib/utils";

/** ネイティブ `<select>` 等と共有するベース（shadcn Input と同一トークン） */
export const inputBaseClassName =
  "flex h-9 w-full rounded-lg border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[color:color-mix(in_srgb,var(--background)_94%,black_6%)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--accent)_55%,transparent)] disabled:cursor-not-allowed disabled:opacity-50";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return <input type={type} className={cn(inputBaseClassName, className)} ref={ref} {...props} />;
});
Input.displayName = "Input";

export { Input };
