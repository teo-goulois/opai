import { Period } from "@opai/context/analytics/period";
import { ToggleGroup, ToggleGroupItem } from "@opai/ui/components/ui/toggle-group";

import { m } from "@/paraglide/messages.js";

import { usePeriodTarget } from "./search";

const labels: Record<Period, () => string> = {
  "24h": m.analytics_period_24h,
  "7d": m.analytics_period_7d,
  "30d": m.analytics_period_30d,
  "90d": m.analytics_period_90d,
};

/**
 * The one period every number of the page uses. It shows the period clicked
 * at once, even while its numbers load.
 */
export function PeriodPicker({ onChange }: { onChange: (period: Period) => void }) {
  const { period: value } = usePeriodTarget();
  return (
    <ToggleGroup
      aria-label={m.analytics_period()}
      value={[value]}
      onValueChange={(next) => {
        const parsed = Period.safeParse(next[0]);
        if (parsed.success) onChange(parsed.data);
      }}
    >
      {Period.options.map((period) => (
        <ToggleGroupItem key={period} value={period}>
          {labels[period]()}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
