import { cn } from "@opai/ui/lib/utils";
import type * as React from "react";

// Untitled theme, Text field specification applied to a multi-line field: same
// surface, edge, padding, typography, and states as Input.
export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full min-w-0 resize-y rounded-s bg-neutral-1 px-s py-xs",
        "font-ui text-m font-regular text-neutral-10 dark:bg-neutral-2",
        "edge-outer outline-none transition-[background-color,color,box-shadow]",
        "placeholder:text-neutral-7 focus-visible:focus-ring aria-invalid:edge-error",
        "read-only:bg-neutral-2 read-only:text-neutral-8",
        "disabled:cursor-not-allowed disabled:bg-neutral-3 disabled:text-neutral-6",
        className,
      )}
      {...props}
    />
  );
}
