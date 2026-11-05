"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cn } from "@opai/ui/lib/utils";
import type React from "react";

// A menu of actions under a button. No Graphical specification: the popup is
// the Autocomplete popup's surface, the items its rows.

export const Menu: typeof MenuPrimitive.Root = MenuPrimitive.Root;

export function MenuTrigger(props: MenuPrimitive.Trigger.Props): React.ReactElement {
  return <MenuPrimitive.Trigger data-slot="menu-trigger" {...props} />;
}

export function MenuPopup({
  className,
  align = "end",
  side = "bottom",
  sideOffset = 4,
  children,
  ...props
}: MenuPrimitive.Popup.Props & {
  align?: MenuPrimitive.Positioner.Props["align"];
  side?: MenuPrimitive.Positioner.Props["side"];
  sideOffset?: MenuPrimitive.Positioner.Props["sideOffset"];
}): React.ReactElement {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        className="z-50 select-none"
        data-slot="menu-positioner"
      >
        <MenuPrimitive.Popup
          className={cn(
            "flex min-w-40 max-w-(--available-width) flex-col p-xxs outline-none",
            "origin-(--transform-origin) rounded-m bg-neutral-1 font-ui text-m text-neutral-10 dark:bg-neutral-2",
            "edge-outer shadow-m transition-[scale,opacity]",
            "data-starting-style:scale-(--motion-popup-scale) data-starting-style:opacity-0",
            "data-ending-style:scale-(--motion-popup-scale) data-ending-style:opacity-0",
            className,
          )}
          data-slot="menu-popup"
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

export function MenuItem({
  className,
  variant = "default",
  ...props
}: MenuPrimitive.Item.Props & { variant?: "default" | "danger" }): React.ReactElement {
  return (
    <MenuPrimitive.Item
      className={cn(
        "flex cursor-default select-none items-center gap-xs rounded-s px-xs py-xxs",
        "font-ui text-m font-regular outline-none",
        variant === "danger" ? "text-error" : "text-neutral-10",
        "data-highlighted:bg-neutral-3",
        "data-disabled:pointer-events-none data-disabled:text-neutral-6",
        className,
      )}
      data-slot="menu-item"
      {...props}
    />
  );
}

export function MenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      className={cn("mx-xs my-xxs h-px bg-neutral-4", className)}
      data-slot="menu-separator"
      {...props}
    />
  );
}
