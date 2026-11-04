import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AutomationList, AutomationListSkeleton } from "@/components/automations/automation-list";
import { RouteError } from "@/components/shared/route-error";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/automations/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(orpc.automations.list.queryOptions()),
  pendingComponent: AutomationListSkeleton,
  errorComponent: RouteError,
  component: AutomationsPage,
});

function AutomationsPage() {
  const queryClient = useQueryClient();
  const { data: automations } = useSuspenseQuery(orpc.automations.list.queryOptions());
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.automations.list.key() });
  const options = {
    onSettled: () => {
      setPending(undefined);
      void refresh();
    },
    onError: (failure: Error) => setError(failure.message),
  };
  const status = useMutation(orpc.automations.codexStatus.mutationOptions(options));
  const archive = useMutation(orpc.automations.archiveCodex.mutationOptions(options));
  const agent = useMutation(orpc.automations.agent.mutationOptions(options));

  return (
    <AutomationList
      automations={automations}
      actions={{
        setStatus: (path, next) => {
          setError(undefined);
          setPending(path);
          status.mutate({ path, status: next });
        },
        archive: (path) => {
          setError(undefined);
          setPending(path);
          archive.mutate({ path });
        },
        agent: (label, action) => {
          setError(undefined);
          setPending(label);
          agent.mutate({ label, action });
        },
        ...(pending ? { pending } : {}),
        ...(error ? { error } : {}),
      }}
    />
  );
}
