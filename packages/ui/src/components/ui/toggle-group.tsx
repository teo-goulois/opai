"use client";

import type { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import type * as React from "react";
import { cn } from "@opai/ui/lib/utils";
import { Toggle } from "@opai/ui/components/ui/toggle";

// Untitled theme, Toggle group specification (gui/components/untitled/toggle-group.md):
// borderless toggles spaced by XXS.
export function ToggleGroup({
  className,
  orientation = "horizontal",
  ...props
}: ToggleGroupPrimitive.Props): React.ReactElement {
  return (
    <ToggleGroupPrimitive
      className={(state) =>
        cn(
          "flex w-fit gap-xxs",
          orientation === "vertical" && "flex-col",
          typeof className === "function" ? className(state) : className,
        )
      }
      data-slot="toggle-group"
      orientation={orientation}
      {...props}
    />
  );
}

export function ToggleGroupItem(props: TogglePrimitive.Props): React.ReactElement {
  return <Toggle {...props} />;
}

export { ToggleGroupPrimitive };
