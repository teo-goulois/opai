import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { AutomationList, AutomationListSkeleton } from "@/components/automations/automation-list";
import { RouteError } from "@/components/shared/route-error";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/automations/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(orpc.automations.list.queryOptions()),
  pendingComponent: AutomationListSkeleton,
  errorComponent: RouteError,
  component: AutomationsPage,
});

function AutomationsPage() {
  const { data: automations } = useSuspenseQuery(orpc.automations.list.queryOptions());
  return <AutomationList automations={automations} />;
}
