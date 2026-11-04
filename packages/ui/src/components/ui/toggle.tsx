"use client";

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cva } from "class-variance-authority";
import type React from "react";
import { cn } from "@opai/ui/lib/utils";

// Untitled theme, Toggle specification (gui/components/untitled/toggle.md).
export const toggleVariants = cva([
  "relative inline-flex shrink-0 cursor-pointer select-none items-center justify-center",
  "gap-xs rounded-s px-s py-xs whitespace-nowrap",
  "bg-transparent font-ui text-m font-medium text-neutral-10",
  "transition-[background-color,color] outline-none focus-visible:focus-ring",
  "hover:bg-neutral-3 data-pressed:bg-neutral-3",
  "disabled:pointer-events-none disabled:text-neutral-6",
  "[&_svg]:pointer-events-none [&_svg]:shrink-0",
]);

export function Toggle({ className, ...props }: TogglePrimitive.Props): React.ReactElement {
  return (
    <TogglePrimitive
      className={(state) =>
        cn(toggleVariants(), typeof className === "function" ? className(state) : className)
      }
      data-slot="toggle"
      {...props}
    />
  );
}

export { TogglePrimitive };
