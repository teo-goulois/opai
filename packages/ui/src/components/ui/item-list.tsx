"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "@opai/ui/lib/utils";
import type * as React from "react";

// A quiet list: no outer frame, rows set apart by spacing, a neutral-3 fill
// on hover when the row is a link. No Graphical specification: composed from
// the theme's tokens.

export function ItemList({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul data-slot="item-list" className={cn("-mx-s flex flex-col gap-xxs", className)} {...props} />
  );
}

/** One row. Pass a router link through `render` to make the whole row a link. */
export function ItemRow({ className, render, ...props }: useRender.ComponentProps<"div">) {
  const defaultProps = {
    "data-slot": "item-row",
    className: cn(
      "flex min-w-0 items-center gap-m rounded-s px-s py-xs outline-none transition-colors",
      "[a]:hover:bg-neutral-3 [a]:focus-visible:focus-ring",
      className,
    ),
  };
  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(defaultProps, props),
  });
}

/** The title and its description, taking the free width. */
export function ItemMain({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-main"
      className={cn("flex min-w-0 flex-1 flex-col gap-xxs", className)}
      {...props}
    />
  );
}

export function ItemTitle({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="item-title"
      className={cn(
        "flex min-w-0 items-center gap-xs font-ui text-m font-medium text-neutral-10",
        className,
      )}
      {...props}
    />
  );
}

export function ItemDescription({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="item-description"
      className={cn("line-clamp-2 font-ui text-s text-pretty text-neutral-7", className)}
      {...props}
    />
  );
}

/** Metadata or controls at the end of the row. */
export function ItemEnd({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-end"
      className={cn(
        "flex shrink-0 items-center gap-xs font-ui text-s text-neutral-7 tabular-nums",
        className,
      )}
      {...props}
    />
  );
}
