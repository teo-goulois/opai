"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "@opai/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

// No Graphical specification: composed from the theme's tokens. Status colors
// are too light for text, so they tint the fill and the text stays neutral.
const badgeVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-xxs whitespace-nowrap",
    "rounded-xs px-xs py-[calc(var(--space-xxs)/2)] font-ui text-xs font-medium",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        neutral: "bg-neutral-3 text-neutral-8",
        accent: "bg-color-1-transparent text-neutral-10",
        success: "bg-success-transparent text-neutral-10",
        warning: "bg-warning-transparent text-neutral-10",
        error: "bg-error-transparent text-neutral-10",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

interface BadgeProps extends useRender.ComponentProps<"span"> {
  variant?: VariantProps<typeof badgeVariants>["variant"];
}

function Badge({ className, variant, render, ...props }: BadgeProps) {
  const defaultProps = {
    className: cn(badgeVariants({ className, variant })),
    "data-slot": "badge",
  };

  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(defaultProps, props),
    render,
  });
}

export { Badge, badgeVariants };
