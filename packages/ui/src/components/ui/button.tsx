"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { AnimatedIconSwap } from "@opai/ui/components/ui/animated-icon-swap";
import { Spinner } from "@opai/ui/components/ui/spinner";
import { smallMotion } from "@opai/ui/lib/motion";
import { cn } from "@opai/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Children,
  createContext,
  type CSSProperties,
  Fragment,
  isValidElement,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
  useContext,
} from "react";

// Untitled theme, Button specification (gui/components/untitled/button.md).
// Height is the label line height plus top and bottom padding; edges are
// box shadows; keyboard focus keeps the theme outline.
const buttonVariants = cva(
  [
    "group/button relative inline-flex shrink-0 cursor-pointer select-none items-center justify-center",
    "gap-xs rounded-s font-ui text-m font-medium whitespace-nowrap",
    "transition-[color,background-color,box-shadow,translate]",
    "outline-none focus-visible:focus-ring",
    "active:not-disabled:not-aria-[haspopup]:translate-y-(--motion-press-distance)",
    "disabled:pointer-events-none",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary: [
          "bg-color-1 text-primary-foreground edge hover:shadow-s",
          "disabled:bg-neutral-3 disabled:text-neutral-6",
        ],
        secondary: [
          "bg-neutral-3 text-neutral-10 edge-outer",
          "hover:bg-neutral-4-transparent aria-expanded:bg-neutral-4-transparent",
          "disabled:text-neutral-6",
        ],
        outline: [
          "bg-transparent text-neutral-10 edge edge-neutral-4",
          "hover:bg-neutral-3-transparent aria-expanded:bg-neutral-3-transparent",
          "focus-visible:edge-color-1-transparent",
          "disabled:edge-neutral-4-transparent disabled:text-neutral-6",
        ],
        ghost: [
          "bg-transparent text-neutral-10",
          "hover:bg-neutral-3-transparent aria-expanded:bg-neutral-3-transparent",
          "focus-visible:edge disabled:text-neutral-6",
        ],
        danger: [
          "bg-error text-neutral-10 edge hover:shadow-s dark:text-neutral-1",
          "disabled:bg-neutral-3 disabled:text-neutral-6",
        ],
      },
      size: {
        default: "px-m py-xs",
        // Icon only: same height, and a square content box as wide as the
        // label line height, so the control stays square.
        icon: "p-xs *:min-h-(--line-m) *:min-w-(--line-m) *:justify-center",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

type IconElement = ReactElement<{ "data-slot"?: string; className?: string }>;

function isIconElement(child: ReactNode): child is IconElement {
  return isValidElement(child) && (child.props as { "data-slot"?: string })["data-slot"] === "icon";
}

// Children.forEach does not traverse into Fragments: `<>…</>` arrives as a
// single Fragment element, so its content must be flattened before scanning.
function flattenChildren(children: ReactNode): ReactNode[] {
  const flattened: ReactNode[] = [];

  Children.forEach(children, (child) => {
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) {
      flattened.push(...flattenChildren(child.props.children));
      return;
    }

    flattened.push(child);
  });

  return flattened;
}

function splitChildren(children: ReactNode): {
  endIcon: IconElement | null;
  label: ReactNode[];
  startIcon: IconElement | null;
} {
  const label: ReactNode[] = [];
  let startIcon: IconElement | null = null;
  let endIcon: IconElement | null = null;

  for (const child of flattenChildren(children)) {
    if (isIconElement(child)) {
      // An icon before any content leads the label; one after it trails.
      if (startIcon === null && label.length === 0) {
        startIcon = child;
        continue;
      }
      if (endIcon === null) {
        endIcon = child;
        continue;
      }
    }

    label.push(child);
  }

  return { endIcon, label, startIcon };
}

const slotTransition = smallMotion;

// Motion animates the button's own width (layout), so the primitive is
// wrapped once at module level.
const MotionButtonPrimitive = motion.create(ButtonPrimitive);

// These props collide with motion's own props on the wrapped primitive, so
// they are excluded from the public API (`style` is re-added below without
// Base UI's state-callback form, which motion cannot handle).
type MotionConflictingProps = "onAnimationStart" | "onDrag" | "onDragStart" | "onDragEnd" | "style";

type ButtonProps = Omit<ButtonPrimitive.Props, MotionConflictingProps> &
  VariantProps<typeof buttonVariants> & {
    isPending?: boolean;
    /** Replaces the label while `isPending` is true. */
    pendingContent?: ReactNode;
    pendingDisables?: boolean;
    style?: CSSProperties;
  };

type ButtonDefaultsProviderProps = PropsWithChildren<{
  className?: string;
  size?: ButtonProps["size"];
}>;

const ButtonDefaultsContext = createContext<Omit<ButtonDefaultsProviderProps, "children">>({});

function ButtonDefaultsProvider({
  children,
  className,
  size,
}: ButtonDefaultsProviderProps): ReactElement {
  const inheritedDefaults = useContext(ButtonDefaultsContext);

  return (
    <ButtonDefaultsContext.Provider
      value={{
        className: cn(inheritedDefaults.className, className),
        size: size ?? inheritedDefaults.size,
      }}
    >
      {children}
    </ButtonDefaultsContext.Provider>
  );
}

function Button({
  className,
  variant = "primary",
  size: sizeProp,
  isPending = false,
  pendingContent,
  pendingDisables = true,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const buttonDefaults = useContext(ButtonDefaultsContext);
  const size = sizeProp ?? buttonDefaults.size ?? "default";
  const resolvedClassName = cn(buttonDefaults.className, className);
  const shouldReduceMotion = useReducedMotion();

  const isIconOnly = size === "icon";
  const { endIcon, label, startIcon } = splitChildren(children);
  const hasIcon = startIcon !== null || endIcon !== null;
  const hasBothIcons = startIcon !== null && endIcon !== null;

  const iconClassName = startIcon?.props.className ?? endIcon?.props.className;

  // The spinner always lives at the inline start (left in LTR, right in RTL);
  // an inline-end icon slides away while pending.
  const startSlot =
    isPending || startIcon ? (
      <AnimatedIconSwap
        activeKey={isPending ? "pending" : "idle"}
        className={iconClassName}
        data-icon="inline-start"
      >
        {isPending ? <Spinner data-slot="icon" className={iconClassName} /> : startIcon}
      </AnimatedIconSwap>
    ) : null;

  const endSlot =
    endIcon && (!isPending || hasBothIcons) ? (
      <AnimatedIconSwap activeKey="idle" className={endIcon.props.className} data-icon="inline-end">
        {endIcon}
      </AnimatedIconSwap>
    ) : null;

  // Icon-only buttons without a slotted icon show just the spinner while pending.
  const hidesLabel = isPending && isIconOnly && !hasIcon;
  const idleLabel = hasIcon ? label : children;
  const content = hidesLabel
    ? null
    : isPending && pendingContent != null
      ? pendingContent
      : idleLabel;
  const hasLabel = Array.isArray(content) ? content.length > 0 : content != null;

  const layout = shouldReduceMotion ? false : ("position" as const);
  const hidden = (x: number) => (shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x });

  return (
    <MotionButtonPrimitive
      // A button rendered as a link (`render={<Link />}`) is not a native button.
      type={props.render ? props.type : (props.type ?? "button")}
      nativeButton={props.render ? false : undefined}
      layout={shouldReduceMotion ? false : true}
      transition={slotTransition}
      data-slot="button"
      data-icon-start={startSlot ? true : undefined}
      data-icon-end={endSlot ? true : undefined}
      aria-busy={isPending || undefined}
      disabled={disabled || (isPending && pendingDisables)}
      className={cn(buttonVariants({ variant, size, className: resolvedClassName }))}
      {...props}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {startSlot ? (
          <motion.span
            key="start"
            layout={layout}
            initial={hidden(-6)}
            animate={{ opacity: 1, x: 0 }}
            exit={hidden(-6)}
            transition={slotTransition}
            className="flex items-center"
          >
            {startSlot}
          </motion.span>
        ) : null}
        {hasLabel ? (
          <motion.span
            key="label"
            layout={layout}
            transition={slotTransition}
            className="flex items-center gap-[inherit]"
          >
            {content}
          </motion.span>
        ) : null}
        {endSlot ? (
          <motion.span
            key="end"
            layout={layout}
            initial={hidden(6)}
            animate={{ opacity: 1, x: 0 }}
            exit={hidden(6)}
            transition={slotTransition}
            className="flex items-center"
          >
            {endSlot}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </MotionButtonPrimitive>
  );
}

export { Button, ButtonDefaultsProvider, buttonVariants, type ButtonProps };
