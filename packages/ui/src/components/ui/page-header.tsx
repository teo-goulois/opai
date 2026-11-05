import { cn } from "@opai/ui/lib/utils";
import type * as React from "react";

// No Graphical specification. One title role for every page (brand font, L,
// medium) and one muted line of metadata under it.

export function PageHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header data-slot="page-header" className={cn("flex flex-col gap-xs", className)} {...props} />
  );
}

export function PageTitle({ className, ...props }: React.ComponentProps<"h1">) {
  return (
    <h1
      data-slot="page-title"
      className={cn("font-brand text-l font-medium text-neutral-10", className)}
      {...props}
    />
  );
}

export function PageDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="page-description"
      className={cn("max-w-prose font-ui text-m text-neutral-7", className)}
      {...props}
    />
  );
}

export function PageMeta({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-meta"
      className={cn(
        "flex flex-wrap items-center gap-x-s gap-y-xxs font-ui text-s text-neutral-7",
        className,
      )}
      {...props}
    />
  );
}

/** A section of a page: a heading, an optional hint, then content. */
export function PageSection({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section data-slot="page-section" className={cn("flex flex-col gap-s", className)} {...props} />
  );
}

export function PageSectionTitle({
  className,
  count,
  children,
  ...props
}: React.ComponentProps<"h2"> & { count?: number }) {
  return (
    <h2
      data-slot="page-section-title"
      className={cn(
        "flex items-baseline gap-xs font-brand text-m font-medium text-neutral-10",
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined ? (
        <span className="font-ui text-s font-regular text-neutral-7 tabular-nums">{count}</span>
      ) : null}
    </h2>
  );
}
