import { cn } from "@opai/ui/lib/utils";
import type * as React from "react";

// No Graphical specification: composed from the theme's tokens. No frame: rows
// separated (and from the header) by a neutral-4 edge; numbers in tabular
// figures, aligned right.

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="w-full overflow-x-auto">
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
        "px-s py-xs text-start font-regular whitespace-nowrap text-neutral-7 first:ps-zero last:pe-zero",
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
        "px-s py-s align-middle text-neutral-10 first:ps-zero last:pe-zero",
        numeric && "text-end whitespace-nowrap tabular-nums",
        className,
      )}
      {...props}
    />
  );
}
