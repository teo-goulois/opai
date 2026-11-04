import { cn } from "@opai/ui/lib/utils";
import type * as React from "react";

// No Graphical specification: a muted key cap from the theme's tokens.
export function Kbd({ className, ...props }: React.ComponentProps<"kbd">): React.ReactElement {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex min-w-(--line-xs) select-none items-center justify-center gap-xxs",
        "rounded-xs bg-neutral-3 px-xxs font-ui text-xs font-medium text-neutral-7",
        className,
      )}
      data-slot="kbd"
      {...props}
    />
  );
}

export function KbdGroup({ className, ...props }: React.ComponentProps<"kbd">): React.ReactElement {
  return (
    <kbd
      className={cn("inline-flex items-center gap-xxs", className)}
      data-slot="kbd-group"
      {...props}
    />
  );
}
