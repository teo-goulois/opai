"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@opai/ui/lib/utils";

// Untitled theme, Switch specification (gui/components/untitled/switch.md).
// Track control size XL (H = 32px): 1.75H by H, S radius, neutral-4, color-1
// when checked. Thumb 0.75H at an H/8 inset, XS radius, neutral-1 with an outer
// edge and S elevation; it travels 0.75H. A press stretches it by 6px
// (min(6px, thumb/4)) and keeps its far edge in place. Small motion.

export function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={(state) =>
        cn(
          "group/switch relative inline-flex h-xl w-[calc(var(--space-xl)*1.75)] shrink-0 cursor-pointer rounded-s",
          "bg-neutral-4 outline-none transition-colors duration-(--motion-duration) ease-small",
          "focus-visible:focus-ring data-checked:bg-color-1",
          "data-disabled:cursor-not-allowed data-disabled:bg-neutral-3",
          typeof className === "function" ? className(state) : className,
        )
      }
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none absolute start-xxs top-xxs size-l rounded-xs bg-neutral-1",
          "shadow-s edge-outer edge-neutral-4-transparent",
          "transition-[translate,width] duration-(--motion-duration) ease-small motion-reduce:transition-none",
          "data-checked:translate-x-l rtl:data-checked:-translate-x-l",
          "group-active/switch:not-data-disabled:not-data-readonly:w-[calc(var(--space-l)+6px)]",
          "group-active/switch:not-data-disabled:not-data-readonly:data-checked:translate-x-[calc(var(--space-l)-6px)]",
          "rtl:group-active/switch:not-data-disabled:not-data-readonly:data-checked:-translate-x-[calc(var(--space-l)-6px)]",
          "motion-reduce:group-active/switch:w-l",
          "motion-reduce:group-active/switch:data-checked:translate-x-l",
          "data-disabled:bg-neutral-6 data-disabled:shadow-none",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
