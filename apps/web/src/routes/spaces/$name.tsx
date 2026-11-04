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

import { RouteError } from "@/components/shared/route-error";
import { SpaceDetail, SpaceDetailSkeleton } from "@/components/spaces/space-detail";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

const spaceQuery = (name: string) => orpc.spaces.get.queryOptions({ input: { name } });

export const Route = createFileRoute("/spaces/$name")({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(spaceQuery(params.name));
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
  pendingComponent: SpaceDetailSkeleton,
  errorComponent: RouteError,
  notFoundComponent: SpaceNotFound,
  component: SpacePage,
});

function SpacePage() {
  const { name } = Route.useParams();
  const { data: space } = useSuspenseQuery(spaceQuery(name));
  return <SpaceDetail space={space} />;
}

function SpaceNotFound() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{m.space_not_found_title()}</EmptyTitle>
        <EmptyDescription>{m.space_not_found_description()}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" render={<Link to="/spaces" />}>
          {m.spaces_back()}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
