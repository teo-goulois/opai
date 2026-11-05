import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { McpPage, McpPageSkeleton } from "@/components/mcp/mcp-page";
import { RouteError } from "@/components/shared/route-error";
import { orpc } from "@/utils/orpc";

const mcpQuery = orpc.mcp.list.queryOptions();

export const Route = createFileRoute("/mcp/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(mcpQuery),
  pendingComponent: McpPageSkeleton,
  errorComponent: RouteError,
  component: McpRoute,
});

function McpRoute() {
  const { data } = useSuspenseQuery(mcpQuery);
  return <McpPage data={data} />;
}
