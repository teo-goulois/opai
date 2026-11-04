import { ChevronRightIcon } from "@opai/ui/icon";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "@opai/ui/lib/utils";
import type * as React from "react";

// No Graphical specification: S text in neutral-7, the current page in
// neutral-10. Links take the router's link through `render`.

export function Breadcrumb({ className, ...props }: React.ComponentProps<"nav">) {
  return <nav data-slot="breadcrumb" className={cn("min-w-0", className)} {...props} />;
}

export function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-xxs font-ui text-s text-neutral-7",
        className,
      )}
      {...props}
    />
  );
}

export function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn("inline-flex min-w-0 items-center gap-xxs", className)}
      {...props}
    />
  );
}

export function BreadcrumbLink({ className, render, ...props }: useRender.ComponentProps<"a">) {
  const defaultProps = {
    className: cn(
      "rounded-xs transition-colors hover:text-neutral-10 focus-visible:focus-ring",
      className,
    ),
    "data-slot": "breadcrumb-link",
  };
  return useRender({ defaultTagName: "a", render, props: mergeProps<"a">(defaultProps, props) });
}

export function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-page"
      aria-current="page"
      className={cn("truncate text-neutral-10", className)}
      {...props}
    />
  );
}

export function BreadcrumbSeparator({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("inline-flex text-neutral-6", className)}
      {...props}
    >
      <ChevronRightIcon />
    </li>
  );
}
