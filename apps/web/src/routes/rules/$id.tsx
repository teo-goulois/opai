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

import { RuleDocument } from "@/components/rules/rule-document";
import { RouteError } from "@/components/shared/route-error";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/rules/$id")({
  validateSearch: z.object({
    view: z.enum(["preview", "markdown"]).optional().catch(undefined),
  }),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(
        orpc.rules.get.queryOptions({ input: { id: params.id } }),
      );
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
  notFoundComponent: RuleNotFound,
  component: RulePage,
});

function RulePage() {
  const { id } = Route.useParams();
  const { view = "preview" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const query = orpc.rules.get.queryOptions({ input: { id } });
  const { data: rule } = useSuspenseQuery(query);
  const update = useMutation(
    orpc.rules.update.mutationOptions({
      onSuccess: (saved) => {
        queryClient.setQueryData(query.queryKey, saved);
        void queryClient.invalidateQueries({ queryKey: orpc.rules.list.key() });
      },
    }),
  );

  return (
    <RuleDocument
      rule={rule}
      view={view}
      onViewChange={(next) =>
        void navigate({ search: { view: next === "preview" ? undefined : next }, replace: true })
      }
      onSave={(markdown, baseHash) => update.mutateAsync({ id, markdown, baseHash })}
      onReload={() => queryClient.refetchQueries({ queryKey: query.queryKey })}
    />
  );
}

function RuleNotFound() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{m.rule_not_found_title()}</EmptyTitle>
        <EmptyDescription>{m.rule_not_found_description()}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" render={<Link to="/rules" />}>
          {m.rules_back()}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
