"use client";

import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@opai/ui/lib/utils";
import { cva } from "class-variance-authority";
import type * as React from "react";

// Untitled theme, Text field specification (gui/components/untitled/input.md).
// The control span owns the surface and edge; the input inside owns padding.
const inputControlVariants = cva("", {
  variants: {
    unstyled: {
      false: [
        "relative inline-flex w-full rounded-s",
        "bg-neutral-1 font-ui text-m font-regular text-neutral-10 dark:bg-neutral-2",
        "edge-outer transition-[background-color,color,box-shadow]",
        "has-focus-visible:focus-ring",
        "has-aria-invalid:edge-error has-data-valid:edge-success",
        "has-[input[readonly]]:bg-neutral-2 has-[input[readonly]]:text-neutral-8",
        "has-disabled:bg-neutral-3 has-disabled:text-neutral-6",
      ],
      true: "",
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

const inputVariants = cva(
  [
    "w-full min-w-0 rounded-[inherit] bg-transparent px-s py-xs",
    "outline-none placeholder:text-neutral-7 disabled:cursor-not-allowed",
  ],
  {
    variants: {
      type: {
        file: "text-neutral-7 file:me-s file:bg-transparent file:font-medium file:text-neutral-10",
        search: [
          "[&::-webkit-search-cancel-button]:appearance-none",
          "[&::-webkit-search-decoration]:appearance-none",
          "[&::-webkit-search-results-button]:appearance-none",
          "[&::-webkit-search-results-decoration]:appearance-none",
        ],
      },
    },
  },
);

export type InputProps = Omit<
  InputPrimitive.Props & React.RefAttributes<HTMLInputElement>,
  "size"
> & {
  /** The native `size` attribute (width in characters). */
  size?: number;
  unstyled?: boolean;
  nativeInput?: boolean;
};

function getInputTypeVariant(type: InputProps["type"]): "file" | "search" | undefined {
  if (type === "file") {
    return "file";
  }

  if (type === "search") {
    return "search";
  }

  return undefined;
}

export function Input({
  className,
  size,
  unstyled = false,
  nativeInput = false,
  style,
  ...props
}: InputProps): React.ReactElement {
  const inputClassName = inputVariants({ type: getInputTypeVariant(props.type) });

  const inputControlClassName = cn(inputControlVariants({ unstyled }), className);

  return (
    <span className={inputControlClassName || undefined} data-slot="input-control">
      {nativeInput ? (
        <input
          className={inputClassName}
          data-slot="input"
          size={size}
          style={typeof style === "function" ? undefined : style}
          {...props}
        />
      ) : (
        <InputPrimitive
          className={inputClassName}
          data-slot="input"
          size={size}
          style={style}
          {...props}
        />
      )}
    </span>
  );
}

export { InputPrimitive, inputControlVariants, inputVariants };
