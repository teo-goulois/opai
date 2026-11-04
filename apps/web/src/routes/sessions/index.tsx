import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { SessionList, SessionListSkeleton } from "@/components/sessions/session-list";
import { RouteError } from "@/components/shared/route-error";
import { orpc } from "@/utils/orpc";

const sessionsQuery = orpc.sessions.list.queryOptions();
const skillUsesQuery = orpc.sessions.skillUses.queryOptions();

export const Route = createFileRoute("/sessions/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(sessionsQuery),
      context.queryClient.ensureQueryData(skillUsesQuery),
    ]),
  pendingComponent: SessionListSkeleton,
  errorComponent: RouteError,
  component: SessionsPage,
});

function SessionsPage() {
  const { data: sessions } = useSuspenseQuery(sessionsQuery);
  const { data: skills } = useSuspenseQuery(skillUsesQuery);
  return <SessionList sessions={sessions} skills={skills} />;
}
