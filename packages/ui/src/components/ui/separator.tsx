import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import type React from "react";
import { cn } from "@opai/ui/lib/utils";

// Untitled theme, Separator specification: an XXS-thick box whose leading side
// paints a neutral-4 inset line.
export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorPrimitive.Props): React.ReactElement {
  return (
    <SeparatorPrimitive
      className={cn(
        "shrink-0 bg-transparent edge-neutral-4",
        "data-[orientation=horizontal]:h-xxs data-[orientation=horizontal]:w-full",
        "data-[orientation=horizontal]:min-w-m data-[orientation=horizontal]:edge-top",
        "data-[orientation=vertical]:w-xxs data-[orientation=vertical]:min-h-l",
        "data-[orientation=vertical]:self-stretch data-[orientation=vertical]:edge-start",
        className,
      )}
      data-slot="separator"
      orientation={orientation}
      {...props}
    />
  );
}

export { SeparatorPrimitive };
