import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { RuleList, RuleListSkeleton } from "@/components/rules/rule-list";
import { RouteError } from "@/components/shared/route-error";
import { orpc } from "@/utils/orpc";

const spacesQuery = orpc.spaces.list.queryOptions();

export const Route = createFileRoute("/rules/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(orpc.rules.list.queryOptions()),
      context.queryClient.ensureQueryData(spacesQuery),
    ]),
  pendingComponent: RuleListSkeleton,
  errorComponent: RouteError,
  component: RulesPage,
});

function RulesPage() {
  const { data: rules } = useSuspenseQuery(orpc.rules.list.queryOptions());
  const { data: spaces } = useSuspenseQuery(spacesQuery);
  return <RuleList rules={rules} spaces={spaces} />;
}
