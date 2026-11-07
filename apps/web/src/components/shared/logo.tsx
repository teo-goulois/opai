import { LOGO_PATH, LOGO_VIEWBOX } from "@opai/context/brand";

import { m } from "@/paraglide/messages.js";

/** The wordmark, in the current color; its height sets its size. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox={LOGO_VIEWBOX}
      fill="currentColor"
      role="img"
      aria-label={m.app_name()}
      className={className}
    >
      <path d={LOGO_PATH} />
    </svg>
  );
}
