"use client";

import { Field as FieldPrimitive } from "@base-ui/react/field";
import { cn } from "@opai/ui/lib/utils";

// Untitled theme, Field specification (gui/components/untitled/field.md): a
// vertical stack with an XS gap; label M medium neutral-10; description M
// neutral-7 and error M in the error color, both within 40ch. The control is
// the shared Input.

export function Field({ className, ...props }: FieldPrimitive.Root.Props) {
  return (
    <FieldPrimitive.Root
      data-slot="field"
      className={(state) =>
        cn(
          "flex flex-col gap-xs font-ui text-m text-neutral-10",
          typeof className === "function" ? className(state) : className,
        )
      }
      {...props}
    />
  );
}

export function FieldLabel({ className, ...props }: FieldPrimitive.Label.Props) {
  return (
    <FieldPrimitive.Label
      data-slot="field-label"
      className={(state) =>
        cn(
          "font-ui text-m font-medium text-neutral-10 data-disabled:text-neutral-6",
          typeof className === "function" ? className(state) : className,
        )
      }
      {...props}
    />
  );
}

export function FieldDescription({ className, ...props }: FieldPrimitive.Description.Props) {
  return (
    <FieldPrimitive.Description
      data-slot="field-description"
      className={(state) =>
        cn(
          "max-w-[40ch] font-ui text-m text-neutral-7",
          typeof className === "function" ? className(state) : className,
        )
      }
      {...props}
    />
  );
}

export function FieldError({ className, ...props }: FieldPrimitive.Error.Props) {
  return (
    <FieldPrimitive.Error
      data-slot="field-error"
      className={(state) =>
        cn(
          "max-w-[40ch] font-ui text-m text-error",
          typeof className === "function" ? className(state) : className,
        )
      }
      {...props}
    />
  );
}

export { FieldPrimitive };
