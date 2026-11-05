import { Button } from "@opai/ui/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@opai/ui/components/ui/empty";
import { ORPCError } from "@orpc/client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";

import { SessionDetail, SessionDetailSkeleton } from "@/components/sessions/session-detail";
import { RouteError } from "@/components/shared/route-error";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

const subagentQuery = (id: string, agent: string) =>
  orpc.sessions.subagent.queryOptions({ input: { id, agent } });

export const Route = createFileRoute("/sessions/$id/agents/$agent")({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(subagentQuery(params.id, params.agent));
    } catch (error) {
      if (
        error instanceof ORPCError &&
        (error.code === "NOT_FOUND" || error.code === "BAD_REQUEST")
      ) {
        throw notFound();
      }
      throw error;
    }
  },
  pendingComponent: SessionDetailSkeleton,
  errorComponent: RouteError,
  notFoundComponent: SubagentNotFound,
  component: SubagentPage,
});

function SubagentPage() {
  const { id, agent } = Route.useParams();
  const { data: session } = useSuspenseQuery(subagentQuery(id, agent));
  return <SessionDetail session={session} />;
}

function SubagentNotFound() {
  const { id } = Route.useParams();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{m.session_agent_not_found_title()}</EmptyTitle>
        <EmptyDescription>{m.session_agent_not_found_description()}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" render={<Link to="/sessions/$id" params={{ id }} />}>
          {m.session_agent_back()}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
