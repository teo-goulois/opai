import { Button } from "@opai/ui/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@opai/ui/components/ui/empty";
import { ORPCError } from "@orpc/client";
import { Link, Outlet, createFileRoute, notFound } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { loadSpaceData } from "@/components/spaces/space-data";
import { SpacePageSkeleton } from "@/components/spaces/space-overview";
import { m } from "@/paraglide/messages.js";

/** Every page of a space: its overview, its tabs, and its rules and skills. */
export const Route = createFileRoute("/spaces/$name")({
  loader: async ({ context, params }) => {
    try {
      await loadSpaceData(context.queryClient, params.name);
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
  pendingComponent: SpacePageSkeleton,
  errorComponent: RouteError,
  notFoundComponent: SpaceNotFound,
  component: Outlet,
});

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
