import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

/** Shared with icon tiles / chips so they match `variant="accent"` primary actions. */
export const accentButtonSurfaceBaseClassName =
  "border border-[color:color-mix(in_srgb,var(--accent)_55%,white_45%)] bg-[linear-gradient(120deg,color-mix(in_srgb,var(--accent)_85%,#1d4ed8_15%),color-mix(in_srgb,var(--accent)_72%,#4338ca_28%))] text-[var(--accent-contrast)]";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_92%,black_8%)] text-[var(--foreground)] hover:bg-[color:color-mix(in_srgb,var(--surface)_84%,black_16%)]",
        accent: `${accentButtonSurfaceBaseClassName} hover:brightness-110`,
        ghost:
          "text-[var(--muted)] hover:bg-[color:color-mix(in_srgb,var(--surface)_92%,black_8%)] hover:text-[var(--foreground)]",
      },
      size: {
        default: "h-9 px-3 py-2",
        sm: "h-8 rounded-md px-2 text-xs",
        lg: "h-10 px-5",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
