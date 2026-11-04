import type React from "react";
import { cn } from "@opai/ui/lib/utils";

// No Graphical specification: title and description follow the Dialog title
// (M, medium) and description (M, neutral-7) roles.
export function Empty({ className, ...props }: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-l px-l py-xxl text-center",
        className,
      )}
      data-slot="empty"
      {...props}
    />
  );
}

export function EmptyHeader({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn("flex max-w-sm flex-col items-center gap-xxs text-center", className)}
      data-slot="empty-header"
      {...props}
    />
  );
}

export function EmptyMedia({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn("flex shrink-0 items-center justify-center text-neutral-7 text-l", className)}
      data-slot="empty-media"
      {...props}
    />
  );
}

export function EmptyTitle({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn("font-ui text-m font-medium text-neutral-10", className)}
      data-slot="empty-title"
      {...props}
    />
  );
}

export function EmptyDescription({
  className,
  ...props
}: React.ComponentProps<"p">): React.ReactElement {
  return (
    <div
      className={cn(
        "font-ui text-m text-neutral-7",
        "[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-neutral-10",
        className,
      )}
      data-slot="empty-description"
      {...props}
    />
  );
}

export function EmptyContent({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn("flex w-full min-w-0 max-w-sm flex-col items-center gap-m", className)}
      data-slot="empty-content"
      {...props}
    />
  );
}
