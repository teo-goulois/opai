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

import { useAutomationActions, useMachines } from "@/components/automations/automation-data";
import {
  AutomationEntry,
  AutomationEntrySkeleton,
} from "@/components/automations/automation-entry";
import { RouteError } from "@/components/shared/route-error";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

const entryQuery = (space: string, id: string) =>
  orpc.automations.entry.queryOptions({ input: { space, id } });

export const Route = createFileRoute("/automations/$space/$entry")({
  validateSearch: z.object({
    view: z.enum(["preview", "markdown"]).optional().catch(undefined),
  }),
  loader: async ({ context, params }) => {
    try {
      await Promise.all([
        context.queryClient.ensureQueryData(entryQuery(params.space, params.entry)),
        context.queryClient.ensureQueryData(orpc.automations.list.queryOptions()),
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
  pendingComponent: AutomationEntrySkeleton,
  errorComponent: RouteError,
  notFoundComponent: EntryNotFound,
  component: EntryPage,
});

function EntryPage() {
  const { space, entry: id } = Route.useParams();
  const { view = "preview" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const query = entryQuery(space, id);
  const { data: entry } = useSuspenseQuery(query);
  const { data: automations } = useSuspenseQuery(orpc.automations.list.queryOptions());
  const machines = useMachines(automations);
  const actions = useAutomationActions();
  const update = useMutation(
    orpc.automations.updateEntry.mutationOptions({
      onSuccess: (saved) => {
        queryClient.setQueryData(entryQuery(space, saved.id).queryKey, saved);
        void queryClient.invalidateQueries({ queryKey: orpc.automations.key() });
        // A new title gives the entry a new id: follow it.
        if (saved.id !== id) {
          void navigate({ params: { space, entry: saved.id }, search: { view }, replace: true });
        }
      },
    }),
  );

  return (
    <AutomationEntry
      entry={entry}
      automations={automations}
      machines={machines}
      actions={actions}
      view={view}
      onViewChange={(next) =>
        void navigate({ search: { view: next === "preview" ? undefined : next }, replace: true })
      }
      onSave={(markdown, baseHash) => update.mutateAsync({ space, id, markdown, baseHash })}
      onReload={() => queryClient.refetchQueries({ queryKey: query.queryKey })}
    />
  );
}

function EntryNotFound() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{m.automations_entry_not_found_title()}</EmptyTitle>
        <EmptyDescription>{m.automations_entry_not_found_description()}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" render={<Link to="/automations" />}>
          {m.automations_back()}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
