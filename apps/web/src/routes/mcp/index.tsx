import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { FILTERS, McpPage, McpPageSkeleton } from "@/components/mcp/mcp-page";
import { RouteError } from "@/components/shared/route-error";
import { orpc } from "@/utils/orpc";

const mcpQuery = orpc.mcp.list.queryOptions();

export const Route = createFileRoute("/mcp/")({
  validateSearch: z.object({
    filter: z.enum(FILTERS).optional().catch(undefined),
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(mcpQuery),
  pendingComponent: McpPageSkeleton,
  errorComponent: RouteError,
  component: McpRoute,
});

function McpRoute() {
  const { data } = useSuspenseQuery(mcpQuery);
  const { filter } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <McpPage
      data={data}
      filter={filter}
      onFilter={(next) => void navigate({ search: { filter: next }, replace: true })}
    />
  );
}
