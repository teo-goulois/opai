import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import {
  AnalyticsOverviewPage,
  AnalyticsOverviewSkeleton,
} from "@/components/analytics/analytics-overview";
import { DEFAULT_PERIOD, analyticsSearch, periodSearch } from "@/components/analytics/search";
import { RouteError } from "@/components/shared/route-error";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/analytics/")({
  validateSearch: analyticsSearch,
  loaderDeps: ({ search }) => ({ period: search.period ?? DEFAULT_PERIOD }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      orpc.analytics.overview.queryOptions({ input: { period: deps.period } }),
    ),
  pendingComponent: AnalyticsOverviewSkeleton,
  errorComponent: RouteError,
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const period = Route.useSearch().period ?? DEFAULT_PERIOD;
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(orpc.analytics.overview.queryOptions({ input: { period } }));

  return (
    <AnalyticsOverviewPage
      overview={data}
      period={period}
      onPeriodChange={(next) => void navigate({ search: periodSearch(next), replace: true })}
    />
  );
}
