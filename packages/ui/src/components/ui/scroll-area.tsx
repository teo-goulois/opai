"use client";

import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import type React from "react";
import { cn } from "@opai/ui/lib/utils";

export function ScrollArea({
  className,
  children,
  scrollFade = false,
  scrollbarGutter = false,
  fill = false,
  clampContentMinWidth = true,
  ...props
}: ScrollAreaPrimitive.Root.Props & {
  scrollFade?: boolean;
  scrollbarGutter?: boolean;
  fill?: boolean;
  clampContentMinWidth?: boolean;
}): React.ReactElement {
  return (
    <ScrollAreaPrimitive.Root className={cn("size-full min-h-0", className)} {...props}>
      <ScrollAreaPrimitive.Viewport
        className={cn(
          // sizing & spacing
          "h-full",
          // structure & layout
          "rounded-[inherit]",
          // outline / ring (focus)
          "outline-none",
          // transitions

          // outline (focus)
          "focus-visible:focus-ring",
          // state: has-overflow
          "data-has-overflow-y:overscroll-y-contain data-has-overflow-x:overscroll-x-contain",
          scrollFade && [
            // border & background
            "mask-t-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-y-start)))]",
            "mask-b-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-y-end)))]",
            "mask-l-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-x-start)))]",
            "mask-r-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-x-end)))]",
            // sizing & spacing
            "[--fade-size:var(--space-l)]",
          ],
          scrollbarGutter && "data-has-overflow-y:pe-s data-has-overflow-x:pb-s",
        )}
        data-slot="scroll-area-viewport"
      >
        <ScrollAreaPrimitive.Content
          className={cn(fill && "size-full")}
          data-slot="scroll-area-content"
          style={clampContentMinWidth ? { minWidth: 0 } : undefined}
        >
          {children}
        </ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar orientation="vertical" />
      <ScrollBar orientation="horizontal" />
      <ScrollAreaPrimitive.Corner data-slot="scroll-area-corner" />
    </ScrollAreaPrimitive.Root>
  );
}

export function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props): React.ReactElement {
  return (
    <ScrollAreaPrimitive.Scrollbar
      className={cn(
        // Untitled theme, Scroll area specification: XS thick, XXS margin.
        "m-xxs",
        // structure & layout
        "flex",
        // transitions
        "opacity-0 transition-opacity delay-300 select-none",
        // state: orientation
        "data-[orientation=horizontal]:h-xs data-[orientation=vertical]:w-xs",
        "data-[orientation=horizontal]:flex-col",
        // state: hovering / scrolling
        "data-hovering:opacity-100 data-scrolling:opacity-100",
        "data-hovering:delay-0 data-scrolling:delay-0",

        className,
      )}
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        className="relative flex-1 rounded-full bg-neutral-4 transition-colors hover:bg-neutral-5"
        data-slot="scroll-area-thumb"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export { ScrollAreaPrimitive };
