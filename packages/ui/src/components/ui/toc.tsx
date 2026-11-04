import { cn } from "@opai/ui/lib/utils";
import type * as React from "react";

// "On this page" links for a long document. No Graphical specification: rows
// reuse the Navigation menu link geometry at S text.

export type TocItem = { id: string; title: string; depth?: number };

export function Toc({
  label,
  items,
  className,
  ...props
}: { label: string; items: TocItem[] } & React.ComponentProps<"nav">) {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label={label}
      data-slot="toc"
      className={cn("flex flex-col gap-xs", className)}
      {...props}
    >
      <div className="px-s font-ui text-s font-medium text-neutral-7">{label}</div>
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className={cn(
                "block rounded-s px-s py-xxs font-ui text-s text-neutral-7 transition-colors",
                "hover:bg-neutral-3 hover:text-neutral-10 focus-visible:focus-ring",
                item.depth !== undefined && item.depth > 2 && "ps-l",
              )}
            >
              {item.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
