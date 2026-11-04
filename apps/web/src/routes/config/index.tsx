import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { ConfigPage, ConfigPageSkeleton } from "@/components/config/config-page";
import { RouteError } from "@/components/shared/route-error";
import { orpc } from "@/utils/orpc";

const layoutQuery = orpc.harness.layout.queryOptions();

export const Route = createFileRoute("/config/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(layoutQuery),
  pendingComponent: ConfigPageSkeleton,
  errorComponent: RouteError,
  component: ConfigRoute,
});

function ConfigRoute() {
  const { data: layout } = useSuspenseQuery(layoutQuery);
  return <ConfigPage layout={layout} />;
}
