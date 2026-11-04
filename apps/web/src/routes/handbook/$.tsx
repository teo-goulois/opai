import { Button } from "@opai/ui/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@opai/ui/components/ui/empty";
import { ORPCError } from "@orpc/client";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";

import { HandbookPageView } from "@/components/handbook/handbook-page";
import { RouteError } from "@/components/shared/route-error";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/handbook/$")({
  validateSearch: z.object({
    view: z.enum(["preview", "markdown"]).optional().catch(undefined),
  }),
  loader: async ({ context, params }) => {
    try {
      await Promise.all([
        context.queryClient.ensureQueryData(
          orpc.handbook.page.queryOptions({ input: { slug: params._splat ?? "" } }),
        ),
        context.queryClient.ensureQueryData(orpc.handbook.get.queryOptions()),
      ]);
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
  errorComponent: RouteError,
  notFoundComponent: HandbookPageNotFound,
  component: HandbookPageRoute,
});

function HandbookPageRoute() {
  const { _splat: slug = "" } = Route.useParams();
  const { view = "preview" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const query = orpc.handbook.page.queryOptions({ input: { slug } });
  const { data: page } = useSuspenseQuery(query);
  const { data: handbook } = useSuspenseQuery(orpc.handbook.get.queryOptions());
  const update = useMutation(
    orpc.handbook.update.mutationOptions({
      onSuccess: (saved) => {
        queryClient.setQueryData(query.queryKey, saved);
        void queryClient.invalidateQueries({ queryKey: orpc.handbook.get.key() });
      },
    }),
  );

  return (
    <HandbookPageView
      page={page}
      site={handbook.status === "ready" ? handbook.site : undefined}
      publishable={handbook.status === "ready" && handbook.publishable}
      view={view}
      onViewChange={(next) =>
        void navigate({ search: { view: next === "preview" ? undefined : next }, replace: true })
      }
      onSave={(markdown, baseHash) => update.mutateAsync({ slug, markdown, baseHash })}
      onReload={() => queryClient.refetchQueries({ queryKey: query.queryKey })}
    />
  );
}

function HandbookPageNotFound() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{m.handbook_page_not_found_title()}</EmptyTitle>
        <EmptyDescription>{m.handbook_page_not_found_description()}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" render={<Link to="/handbook" />}>
          {m.handbook_back()}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
