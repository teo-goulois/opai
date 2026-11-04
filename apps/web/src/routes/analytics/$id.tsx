import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { AppAnalytics, AppAnalyticsSkeleton } from "@/components/analytics/app-analytics";
import { FIRST_TABS, metricQuery } from "@/components/analytics/metric-panel";
import { DEFAULT_PERIOD, analyticsSearch, periodSearch } from "@/components/analytics/search";
import { RouteError } from "@/components/shared/route-error";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/analytics/$id")({
  validateSearch: analyticsSearch,
  loaderDeps: ({ search }) => ({ period: search.period ?? DEFAULT_PERIOD }),
  loader: ({ context, params, deps }) => {
    // The first tab of each breakdown starts loading with the page, without holding it.
    for (const dimension of FIRST_TABS) {
      void context.queryClient.prefetchQuery(metricQuery(params.id, deps.period, dimension));
    }
    return context.queryClient.ensureQueryData(
      orpc.analytics.app.queryOptions({ input: { id: params.id, period: deps.period } }),
    );
  },
  pendingComponent: AppAnalyticsSkeleton,
  errorComponent: RouteError,
  component: AppAnalyticsPage,
});

function AppAnalyticsPage() {
  const { id } = Route.useParams();
  const period = Route.useSearch().period ?? DEFAULT_PERIOD;
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(orpc.analytics.app.queryOptions({ input: { id, period } }));

  return (
    <AppAnalytics
      detail={data}
      period={period}
      onPeriodChange={(next) => void navigate({ search: periodSearch(next), replace: true })}
    />
  );
}
