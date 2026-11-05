import { useSuspenseInfiniteQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { SessionList, SessionListSkeleton } from "@/components/sessions/session-list";
import { RouteError } from "@/components/shared/route-error";
import { orpc } from "@/utils/orpc";

// Sessions come a page at a time, the newest first: the server reads only the
// files of each page. The next one loads as the list nears its end.
const sessionsQuery = orpc.sessions.list.infiniteOptions({
  input: (cursor: string | undefined) => (cursor ? { cursor } : {}),
  initialPageParam: undefined,
  getNextPageParam: (page) => page.next,
});
const skillUsesQuery = orpc.sessions.skillUses.queryOptions();

export const Route = createFileRoute("/sessions/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureInfiniteQueryData(sessionsQuery),
      context.queryClient.ensureQueryData(skillUsesQuery),
    ]),
  pendingComponent: SessionListSkeleton,
  errorComponent: RouteError,
  component: SessionsPage,
});

function SessionsPage() {
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage, error } =
    useSuspenseInfiniteQuery(sessionsQuery);
  const { data: skills } = useSuspenseQuery(skillUsesQuery);
  // A session written to between two pages moves up: keep its first place.
  const seen = new Set<string>();
  const sessions = data.pages
    .flatMap((page) => page.sessions)
    .filter((session) => (seen.has(session.id) ? false : (seen.add(session.id), true)));
  return (
    <SessionList
      sessions={sessions}
      skills={skills}
      more={{
        hasMore: hasNextPage,
        loading: isFetchingNextPage,
        error: error?.message,
        load: () => void fetchNextPage(),
      }}
    />
  );
}
