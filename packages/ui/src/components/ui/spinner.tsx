import type React from "react";
import { LoaderIcon } from "@opai/ui/icon";
import { cn } from "@opai/ui/lib/utils";

export function Spinner({
  className,
  ...props
}: React.ComponentProps<typeof LoaderIcon>): React.ReactElement {
  return (
    <LoaderIcon
      aria-label="Loading"
      className={cn("motion-safe:animate-spin", className)}
      role="status"
      {...props}
    />
  );
}
