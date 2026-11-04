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

const sessionQuery = (id: string) => orpc.sessions.get.queryOptions({ input: { id } });

export const Route = createFileRoute("/sessions/$id")({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(sessionQuery(params.id));
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
  notFoundComponent: SessionNotFound,
  component: SessionPage,
});

function SessionPage() {
  const { id } = Route.useParams();
  const { data: session } = useSuspenseQuery(sessionQuery(id));
  return <SessionDetail session={session} />;
}

function SessionNotFound() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{m.session_not_found_title()}</EmptyTitle>
        <EmptyDescription>{m.session_not_found_description()}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" render={<Link to="/sessions" />}>
          {m.sessions_back()}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
