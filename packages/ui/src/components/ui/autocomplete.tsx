"use client";

import { Autocomplete as AutocompletePrimitive } from "@base-ui/react/autocomplete";
import { ChevronsUpDownIcon, XIcon } from "@opai/ui/icon";
import type React from "react";
import { Input } from "@opai/ui/components/ui/input";
import { ScrollArea } from "@opai/ui/components/ui/scroll-area";
import { cn } from "@opai/ui/lib/utils";

// Untitled theme, Autocomplete specification (gui/components/untitled/autocomplete.md).

export const Autocomplete: typeof AutocompletePrimitive.Root = AutocompletePrimitive.Root;

const inputButtonClassName = cn(
  "absolute end-xxs top-1/2 inline-flex -translate-y-1/2 cursor-pointer items-center justify-center",
  "rounded-s p-xxs text-neutral-7 outline-none transition-colors",
  "hover:bg-neutral-3 hover:text-neutral-10 focus-visible:focus-ring",
  "has-[+[data-slot=autocomplete-clear]]:hidden",
  "[&_svg]:pointer-events-none [&_svg]:shrink-0",
);

export function AutocompleteInput({
  className,
  showTrigger = false,
  showClear = false,
  startAddon,
  size,
  triggerProps,
  clearProps,
  ...props
}: Omit<AutocompletePrimitive.Input.Props, "size"> & {
  showTrigger?: boolean;
  showClear?: boolean;
  startAddon?: React.ReactNode;
  /** The native `size` attribute (width in characters). */
  size?: number;
  ref?: React.Ref<HTMLInputElement>;
  triggerProps?: AutocompletePrimitive.Trigger.Props;
  clearProps?: AutocompletePrimitive.Clear.Props;
}): React.ReactElement {
  return (
    <AutocompletePrimitive.InputGroup
      className="relative w-full text-neutral-10 not-has-[>*.w-full]:w-fit"
      data-slot="autocomplete-input-group"
    >
      {startAddon && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 start-0 z-10 flex items-center ps-s text-neutral-7"
          data-slot="autocomplete-start-addon"
        >
          {startAddon}
        </div>
      )}
      <AutocompletePrimitive.Input
        className={cn(
          "shadow-s",
          startAddon &&
            "*:data-[slot=autocomplete-input]:ps-[calc(var(--space-s)+1em+var(--space-xs))]",
          "has-[+[data-slot=autocomplete-trigger],+[data-slot=autocomplete-clear]]:*:data-[slot=autocomplete-input]:pe-xl",
          className,
        )}
        data-slot="autocomplete-input"
        render={<Input nativeInput size={size} />}
        {...props}
      />
      {showTrigger && (
        <AutocompleteTrigger className={inputButtonClassName} {...triggerProps}>
          <AutocompletePrimitive.Icon data-slot="autocomplete-icon">
            <ChevronsUpDownIcon />
          </AutocompletePrimitive.Icon>
        </AutocompleteTrigger>
      )}
      {showClear && (
        <AutocompleteClear className={inputButtonClassName} {...clearProps}>
          <XIcon />
        </AutocompleteClear>
      )}
    </AutocompletePrimitive.InputGroup>
  );
}

export function AutocompletePopup({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  alignOffset,
  align = "start",
  anchor,
  portalProps,
  ...props
}: AutocompletePrimitive.Popup.Props & {
  align?: AutocompletePrimitive.Positioner.Props["align"];
  sideOffset?: AutocompletePrimitive.Positioner.Props["sideOffset"];
  alignOffset?: AutocompletePrimitive.Positioner.Props["alignOffset"];
  side?: AutocompletePrimitive.Positioner.Props["side"];
  anchor?: AutocompletePrimitive.Positioner.Props["anchor"];
  portalProps?: AutocompletePrimitive.Portal.Props;
}): React.ReactElement {
  return (
    <AutocompletePrimitive.Portal {...portalProps}>
      <AutocompletePrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="z-50 select-none"
        data-slot="autocomplete-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <AutocompletePrimitive.Popup
          className={cn(
            "flex max-h-[min(var(--available-height),23rem)] min-w-(--anchor-width) max-w-(--available-width) flex-col",
            "origin-(--transform-origin) rounded-m bg-neutral-1 font-ui text-m text-neutral-10 dark:bg-neutral-2",
            "edge-outer shadow-m transition-[scale,opacity]",
            "data-starting-style:scale-(--motion-popup-scale) data-starting-style:opacity-0",
            "data-ending-style:scale-(--motion-popup-scale) data-ending-style:opacity-0",
            className,
          )}
          data-slot="autocomplete-popup"
          {...props}
        >
          {children}
        </AutocompletePrimitive.Popup>
      </AutocompletePrimitive.Positioner>
    </AutocompletePrimitive.Portal>
  );
}

export function AutocompleteItem({
  className,
  children,
  ...props
}: AutocompletePrimitive.Item.Props): React.ReactElement {
  return (
    <AutocompletePrimitive.Item
      className={cn(
        "flex cursor-default select-none items-center gap-xs rounded-s px-xs py-xxs",
        "font-ui text-m font-regular text-neutral-10 outline-none",
        "data-highlighted:bg-neutral-3 data-selected:bg-neutral-3",
        "data-disabled:pointer-events-none data-disabled:text-neutral-6",
        className,
      )}
      data-slot="autocomplete-item"
      {...props}
    >
      {children}
    </AutocompletePrimitive.Item>
  );
}

export function AutocompleteSeparator({
  className,
  ...props
}: AutocompletePrimitive.Separator.Props): React.ReactElement {
  return (
    <AutocompletePrimitive.Separator
      className={cn("mx-xs my-xxs h-xxs edge-top edge-neutral-4 last:hidden", className)}
      data-slot="autocomplete-separator"
      {...props}
    />
  );
}

export function AutocompleteGroup({
  className,
  ...props
}: AutocompletePrimitive.Group.Props): React.ReactElement {
  return (
    <AutocompletePrimitive.Group
      className={cn("[[role=group]+&]:mt-xxs", className)}
      data-slot="autocomplete-group"
      {...props}
    />
  );
}

export function AutocompleteGroupLabel({
  className,
  ...props
}: AutocompletePrimitive.GroupLabel.Props): React.ReactElement {
  return (
    <AutocompletePrimitive.GroupLabel
      className={cn("px-xs py-xxs font-ui text-s font-medium text-neutral-7", className)}
      data-slot="autocomplete-group-label"
      {...props}
    />
  );
}

export function AutocompleteEmpty({
  className,
  ...props
}: AutocompletePrimitive.Empty.Props): React.ReactElement {
  return (
    <AutocompletePrimitive.Empty
      className={cn(
        "text-center font-ui text-m text-neutral-7 not-empty:px-xs not-empty:py-s",
        className,
      )}
      data-slot="autocomplete-empty"
      {...props}
    />
  );
}

export function AutocompleteRow({
  className,
  ...props
}: AutocompletePrimitive.Row.Props): React.ReactElement {
  return (
    <AutocompletePrimitive.Row className={className} data-slot="autocomplete-row" {...props} />
  );
}

export function AutocompleteValue({
  ...props
}: AutocompletePrimitive.Value.Props): React.ReactElement {
  return <AutocompletePrimitive.Value data-slot="autocomplete-value" {...props} />;
}

export function AutocompleteList({
  className,
  ...props
}: AutocompletePrimitive.List.Props): React.ReactElement {
  return (
    <ScrollArea scrollbarGutter scrollFade>
      <AutocompletePrimitive.List
        className={cn("not-empty:scroll-py-xxs not-empty:p-xxs", className)}
        data-slot="autocomplete-list"
        {...props}
      />
    </ScrollArea>
  );
}

export function AutocompleteClear({
  className,
  ...props
}: AutocompletePrimitive.Clear.Props): React.ReactElement {
  return (
    <AutocompletePrimitive.Clear
      className={cn(inputButtonClassName, className)}
      data-slot="autocomplete-clear"
      {...props}
    >
      <XIcon />
    </AutocompletePrimitive.Clear>
  );
}

export function AutocompleteStatus({
  className,
  ...props
}: AutocompletePrimitive.Status.Props): React.ReactElement {
  return (
    <AutocompletePrimitive.Status
      className={cn(
        "px-s py-xs font-ui text-s font-medium text-neutral-7 empty:m-0 empty:p-0",
        className,
      )}
      data-slot="autocomplete-status"
      {...props}
    />
  );
}

export function AutocompleteCollection({
  ...props
}: AutocompletePrimitive.Collection.Props): React.ReactElement {
  return <AutocompletePrimitive.Collection data-slot="autocomplete-collection" {...props} />;
}

export function AutocompleteTrigger({
  className,
  children,
  ...props
}: AutocompletePrimitive.Trigger.Props): React.ReactElement {
  return (
    <AutocompletePrimitive.Trigger
      className={className}
      data-slot="autocomplete-trigger"
      {...props}
    >
      {children}
    </AutocompletePrimitive.Trigger>
  );
}

export const useAutocompleteFilter: typeof AutocompletePrimitive.useFilter =
  AutocompletePrimitive.useFilter;

export { AutocompletePrimitive };
