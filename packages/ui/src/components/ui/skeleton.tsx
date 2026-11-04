import { cn } from "@opai/ui/lib/utils";

// No Graphical specification: a neutral-3 block with the S radius.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("rounded-s bg-neutral-3 motion-safe:animate-pulse", className)}
      {...props}
    />
  );
}

export { Skeleton };
