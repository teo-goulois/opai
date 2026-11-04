import { cn } from "@opai/ui/lib/utils";
import type * as React from "react";

// No Graphical specification: composed from the theme's tokens, like the lists
// of the rules and skills pages. A filled, outlined container; rows separated
// (and from the header) by a neutral-4 edge; numbers in the data font, aligned right.

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="w-full overflow-x-auto rounded-m bg-neutral-1 edge-outer dark:bg-neutral-2"
    >
      <table
        data-slot="table"
        className={cn("w-full border-collapse font-ui text-s", className)}
        {...props}
      />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={className} {...props} />;
}

export function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&>tr]:edge-top [&>tr]:edge-neutral-4", className)}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr data-slot="table-row" className={className} {...props} />;
}

export function TableHead({
  className,
  numeric,
  ...props
}: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      data-slot="table-head"
      scope="col"
      className={cn(
        "px-s py-xs text-start font-medium whitespace-nowrap text-neutral-7",
        numeric && "text-end",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  numeric,
  ...props
}: React.ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-s py-xs align-middle text-neutral-10",
        numeric && "text-end font-data whitespace-nowrap tabular-nums",
        className,
      )}
      {...props}
    />
  );
}
