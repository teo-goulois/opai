import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { ConfigPage, ConfigPageSkeleton } from "@/components/config/config-page";
import { RouteError } from "@/components/shared/route-error";
import { orpc } from "@/utils/orpc";

const layoutQuery = orpc.harness.layout.queryOptions();
const rulesQuery = orpc.rules.list.queryOptions();

export const Route = createFileRoute("/config/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(layoutQuery),
      context.queryClient.ensureQueryData(rulesQuery),
    ]),
  pendingComponent: ConfigPageSkeleton,
  errorComponent: RouteError,
  component: ConfigRoute,
});

function ConfigRoute() {
  const { data: layout } = useSuspenseQuery(layoutQuery);
  const { data: rules } = useSuspenseQuery(rulesQuery);
  return <ConfigPage layout={layout} rules={rules.filter((rule) => rule.space === undefined)} />;
}
