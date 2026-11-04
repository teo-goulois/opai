import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { SpaceList, SpaceListSkeleton } from "@/components/spaces/space-list";
import { orpc } from "@/utils/orpc";

const spacesQuery = orpc.spaces.list.queryOptions();

export const Route = createFileRoute("/spaces/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(spacesQuery),
  pendingComponent: SpaceListSkeleton,
  errorComponent: RouteError,
  component: SpacesPage,
});

function SpacesPage() {
  const { data: spaces } = useSuspenseQuery(spacesQuery);
  return <SpaceList spaces={spaces} />;
}
