import { cn } from "@opai/ui/lib/utils";
import type * as React from "react";

// Label and value pairs. No Graphical specification: labels in neutral-7,
// values in neutral-10, S text.

export function DescriptionList({ className, ...props }: React.ComponentProps<"dl">) {
  return (
    <dl
      data-slot="description-list"
      className={cn("flex flex-col gap-s font-ui text-s", className)}
      {...props}
    />
  );
}

export function DescriptionItem({
  label,
  children,
  className,
  ...props
}: { label: React.ReactNode } & React.ComponentProps<"div">) {
  return (
    <div
      data-slot="description-item"
      className={cn("flex min-w-0 flex-col gap-xxs", className)}
      {...props}
    >
      <dt className="text-neutral-7">{label}</dt>
      <dd className="min-w-0 break-words text-neutral-10">{children}</dd>
    </div>
  );
}
