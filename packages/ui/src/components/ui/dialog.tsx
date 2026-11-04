"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Button } from "@opai/ui/components/ui/button";
import { XIcon } from "@opai/ui/icon";
import { cn } from "@opai/ui/lib/utils";
import type * as React from "react";

// Untitled theme, Dialog specification (gui/components/untitled/dialog.md):
// centered popup, L padding, S gap, M radius, default edge and L elevation,
// Large motion; title M medium, description M neutral-7, actions at the end.

export const Dialog: typeof DialogPrimitive.Root = DialogPrimitive.Root;

export function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

export function DialogPopup({
  className,
  children,
  showClose = true,
  closeLabel = "Close",
  ...props
}: DialogPrimitive.Popup.Props & { showClose?: boolean; closeLabel?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="dialog-backdrop"
        className={cn(
          "fixed inset-0 z-50 bg-neutral-10-transparent dark:bg-neutral-1-transparent",
          "transition-opacity duration-(--motion-large-duration) ease-large",
          "data-starting-style:opacity-0 data-ending-style:opacity-0",
        )}
      />
      <DialogPrimitive.Popup
        data-slot="dialog-popup"
        className={(state) =>
          cn(
            "fixed top-1/2 left-1/2 z-50 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-s",
            "max-h-[calc(100dvh-var(--space-xl))] w-[min(400px,calc(100vw-var(--space-xl)))] overflow-y-auto",
            "rounded-m bg-neutral-1 p-l font-ui text-m text-neutral-10 dark:bg-neutral-2",
            "edge-outer shadow-l outline-none",
            "transition-[scale,opacity] duration-(--motion-large-duration) ease-large",
            "data-starting-style:scale-(--motion-popup-scale) data-starting-style:opacity-0",
            "data-ending-style:scale-(--motion-popup-scale) data-ending-style:opacity-0",
            typeof className === "function" ? className(state) : className,
          )
        }
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            render={<Button variant="ghost" size="icon" aria-label={closeLabel} />}
            className="absolute end-s top-s"
          >
            <XIcon aria-hidden />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("pe-xl font-ui text-m font-medium text-neutral-10", className)}
      {...props}
    />
  );
}

export function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("font-ui text-m text-neutral-7", className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("mt-xs flex flex-wrap justify-end gap-xs", className)}
      {...props}
    />
  );
}

export function DialogClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

export { DialogPrimitive };
