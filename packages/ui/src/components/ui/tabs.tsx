"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "@opai/ui/lib/utils";

// Untitled theme, Tabs specification (gui/components/untitled/tabs.md): an
// underline list. Tabs are neutral-6 and turn neutral-10 on hover, focus, and
// selection (color-1 when selected in dark mode); a 2px line under the active
// tab moves with Small motion.

type ClassName<State> = string | ((state: State) => string | undefined) | undefined;

function resolve<State>(className: ClassName<State>, state: State) {
  return typeof className === "function" ? className(state) : className;
}

export function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={(state) => cn("flex min-w-0 flex-col", resolve(className, state))}
      {...props}
    />
  );
}

/** The tab look, also used by links that act as tabs (`tabLinkClassName`). */
const tabClassName = cn(
  "relative z-10 inline-flex shrink-0 cursor-pointer items-center gap-xs py-xs",
  "font-ui text-m font-regular whitespace-nowrap text-neutral-6 outline-none transition-colors",
  "hover:text-neutral-10 focus-visible:text-neutral-10 focus-visible:focus-ring",
  "aria-disabled:cursor-default aria-disabled:text-neutral-4",
);

export function TabsList({ className, children, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={(state) =>
        cn(
          "relative z-0 flex w-full gap-l overflow-x-auto edge-bottom edge-neutral-4",
          resolve(className, state),
        )
      }
      {...props}
    >
      {children}
      <TabsPrimitive.Indicator
        data-slot="tabs-indicator"
        className={cn(
          "absolute bottom-0 left-(--active-tab-left) h-(--border-l) w-(--active-tab-width)",
          "bg-neutral-10 transition-[left,width] dark:bg-color-1 motion-reduce:transition-none",
        )}
      />
    </TabsPrimitive.List>
  );
}

export function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={(state) =>
        cn(
          tabClassName,
          "aria-selected:text-neutral-10 dark:aria-selected:text-color-1",
          resolve(className, state),
        )
      }
      {...props}
    />
  );
}

export function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-panel"
      className={(state) =>
        cn("mt-s min-w-0 outline-none focus-visible:focus-ring", resolve(className, state))
      }
      {...props}
    />
  );
}

/** For a row of router links styled as tabs: put this list around them. */
export const tabLinkListClassName = "flex w-full gap-l overflow-x-auto edge-bottom edge-neutral-4";

/** For router links styled as tabs; the current page gets the 2px underline. */
export const tabLinkClassName = cn(
  tabClassName,
  "aria-[current=page]:text-neutral-10 dark:aria-[current=page]:text-color-1",
  "aria-[current=page]:shadow-[inset_0_calc(-1*var(--border-l))_0_0_currentColor]",
);

export { TabsPrimitive };
