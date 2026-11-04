import { Period } from "@opai/context/analytics/period";
import { useRouterState } from "@tanstack/react-router";
import { z } from "zod";

// The period lives in the URL (?period=7d) so a view can be shared and kept
// across the overview and each app. 30 days is the default and stays out of it.

export const DEFAULT_PERIOD = "30d" satisfies Period;

export const analyticsSearch = z.object({ period: Period.optional().catch(undefined) });

export const periodSearch = (period: Period) => ({
  period: period === DEFAULT_PERIOD ? undefined : period,
});

/**
 * The period in the URL, which changes on click, and whether its numbers are
 * still loading. Until they arrive, the page keeps showing the previous ones,
 * dimmed with `dim`.
 */
export function usePeriodTarget() {
  const period = useRouterState({
    select: (state) => analyticsSearch.parse(state.location.search).period ?? DEFAULT_PERIOD,
  });
  const pending = useRouterState({ select: (state) => state.status === "pending" });
  return { period, pending, dim: pending ? "opacity-50 transition-opacity" : "transition-opacity" };
}
