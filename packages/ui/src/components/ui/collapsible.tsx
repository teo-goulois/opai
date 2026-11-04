"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { ChevronRightIcon } from "@opai/ui/icon";
import { cn } from "@opai/ui/lib/utils";

// Untitled theme, Collapsible specification (gui/components/untitled/collapsible.md):
// full-width trigger with a right chevron that turns 90°, Large motion on the
// panel's height and opacity. The "plain" panel drops the neutral-2 surface,
// for content that brings its own frame (lists of rows).

export function Collapsible({ className, ...props }: CollapsiblePrimitive.Root.Props) {
  return (
    <CollapsiblePrimitive.Root
      data-slot="collapsible"
      className={(state) =>
        cn(
          "flex flex-col data-open:gap-s",
          typeof className === "function" ? className(state) : className,
        )
      }
      {...props}
    />
  );
}

export function CollapsibleTrigger({
  className,
  children,
  ...props
}: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      className={(state) =>
        cn(
          "group/collapsible-trigger flex w-full cursor-pointer items-center justify-between gap-xs",
          "rounded-s py-xs text-start font-ui text-m font-medium text-neutral-10",
          "outline-none focus-visible:focus-ring disabled:cursor-default disabled:text-neutral-6",
          typeof className === "function" ? className(state) : className,
        )
      }
      {...props}
    >
      {children}
      <ChevronRightIcon
        aria-hidden
        data-slot="collapsible-indicator"
        className={cn(
          "shrink-0 text-neutral-7 transition-transform duration-(--motion-large-duration) ease-large",
          "group-data-panel-open/collapsible-trigger:rotate-90 motion-reduce:transition-none",
        )}
      />
    </CollapsiblePrimitive.Trigger>
  );
}

export function CollapsiblePanel({
  className,
  children,
  variant = "default",
  ...props
}: CollapsiblePrimitive.Panel.Props & { variant?: "default" | "plain" }) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-panel"
      className={(state) =>
        cn(
          "h-(--collapsible-panel-height) overflow-hidden",
          "transition-[height,opacity] duration-(--motion-large-duration) ease-large",
          "data-starting-style:h-0 data-starting-style:opacity-0",
          "data-ending-style:h-0 data-ending-style:opacity-0 motion-reduce:transition-none",
          variant === "default" && "rounded-s bg-neutral-2 edge-outer",
          typeof className === "function" ? className(state) : className,
        )
      }
      {...props}
    >
      <div
        className={cn("flow-root", variant === "default" && "p-s font-ui text-m text-neutral-8")}
      >
        {children}
      </div>
    </CollapsiblePrimitive.Panel>
  );
}

export { CollapsiblePrimitive };
