"use client";

import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "@opai/ui/lib/utils";
import { cva } from "class-variance-authority";
import type * as React from "react";

// App navigation. No Graphical "sidebar" exists: links follow the Navigation
// menu link specification (gui/components/untitled/navigation-menu.md), the
// panel uses the surface role (neutral-2), and the mobile sheet uses the Drawer
// surface, sliding in from the inline start instead of the bottom.

export function Sidebar({ className, ...props }: React.ComponentProps<"aside">) {
  return (
    <aside
      data-slot="sidebar"
      className={cn(
        "flex h-full min-h-0 w-full flex-col gap-l bg-neutral-2 p-s font-ui text-m text-neutral-10",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn("flex items-center gap-xs", className)}
      {...props}
    />
  );
}

export function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn("flex min-h-0 flex-1 flex-col gap-l overflow-y-auto", className)}
      {...props}
    />
  );
}

export function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="sidebar-footer" className={cn("flex flex-col gap-xxs", className)} {...props} />
  );
}

export function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="sidebar-group" className={cn("flex flex-col gap-xxs", className)} {...props} />
  );
}

export function SidebarGroupLabel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-label"
      className={cn("px-s font-ui text-s font-medium text-neutral-7", className)}
      {...props}
    />
  );
}

export function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul data-slot="sidebar-menu" className={cn("flex flex-col gap-xxs", className)} {...props} />
  );
}

export function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-item" className={cn("min-w-0", className)} {...props} />;
}

export const sidebarLinkVariants = cva([
  "flex w-full min-w-0 items-center gap-xs rounded-s px-s py-xs",
  "font-ui text-m font-regular text-neutral-10 outline-none transition-colors",
  "hover:bg-neutral-3 focus-visible:focus-ring",
  // Selected: TanStack Router marks the current link with data-status="active".
  "data-[status=active]:bg-neutral-3 aria-[current=page]:bg-neutral-3",
  "aria-disabled:pointer-events-none aria-disabled:text-neutral-6",
  "[&_svg]:shrink-0",
]);

/** A navigation row. Pass the router's link through `render`. */
export function SidebarLink({ className, render, ...props }: useRender.ComponentProps<"a">) {
  const defaultProps = {
    className: cn(sidebarLinkVariants(), className),
    "data-slot": "sidebar-link",
  };
  return useRender({ defaultTagName: "a", render, props: mergeProps<"a">(defaultProps, props) });
}

/** The count or hint at the end of a row. */
export function SidebarLinkMeta({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="sidebar-link-meta"
      className={cn("ms-auto font-data text-s text-neutral-7", className)}
      {...props}
    />
  );
}

export const SidebarSheet: typeof SheetPrimitive.Root = SheetPrimitive.Root;

export function SidebarSheetTrigger(props: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sidebar-sheet-trigger" {...props} />;
}

export function SidebarSheetClose(props: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sidebar-sheet-close" {...props} />;
}

export function SidebarSheetPopup({ className, children, ...props }: SheetPrimitive.Popup.Props) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Backdrop
        data-slot="sidebar-sheet-backdrop"
        className={cn(
          "fixed inset-0 z-50 bg-neutral-10-transparent dark:bg-neutral-1-transparent",
          "transition-opacity duration-(--motion-large-duration) ease-large",
          "data-starting-style:opacity-0 data-ending-style:opacity-0",
        )}
      />
      <SheetPrimitive.Popup
        data-slot="sidebar-sheet-popup"
        className={cn(
          "fixed inset-y-0 start-0 z-50 flex w-72 max-w-[calc(100vw-var(--space-xl))] flex-col",
          "overflow-hidden rounded-e-m bg-neutral-1 text-neutral-10 outline-none dark:bg-neutral-2",
          "edge-outer shadow-l",
          "transition-transform duration-(--motion-large-duration) ease-large",
          "data-starting-style:-translate-x-full data-ending-style:-translate-x-full",
          "rtl:data-starting-style:translate-x-full rtl:data-ending-style:translate-x-full",
          className,
        )}
        {...props}
      >
        {children}
      </SheetPrimitive.Popup>
    </SheetPrimitive.Portal>
  );
}

export function SidebarSheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sidebar-sheet-title"
      className={cn("sr-only", className)}
      {...props}
    />
  );
}
