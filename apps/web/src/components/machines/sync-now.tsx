import type { SyncResult } from "@opai/context/sync-now";
import { Button } from "@opai/ui/components/ui/button";
import { RefreshIcon } from "@opai/ui/icon";
import { Spinner } from "@opai/ui/components/ui/spinner";
import {
  useIsMutating,
  useMutation,
  useMutationState,
  useQueryClient,
} from "@tanstack/react-query";

import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

const syncKey = orpc.machines.sync.mutationKey();

/** "Sync now": the Machines page and the palette share its state. */
export function useSyncNow() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.machines.sync.mutationOptions({
      onSettled: () =>
        Promise.all(
          [orpc.machines.key(), orpc.skills.key(), orpc.mcp.key()].map((queryKey) =>
            queryClient.invalidateQueries({ queryKey }),
          ),
        ),
    }),
  );
}

function summary(result: SyncResult) {
  const parts = [
    result.shared.length > 0 ? m.sync_shared({ count: result.shared.length }) : undefined,
    result.pushed > 0 ? m.sync_pushed({ count: result.pushed }) : undefined,
    result.pulled > 0 ? m.sync_pulled({ count: result.pulled }) : undefined,
    result.configs.length > 0 ? m.sync_configs() : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : m.sync_up_to_date();
}

/** The button, and what the last sync did, wherever it was started. */
export function SyncNow() {
  const sync = useSyncNow();
  const running = useIsMutating({ mutationKey: syncKey }) > 0;
  const last = useMutationState({
    filters: { mutationKey: syncKey },
    select: (mutation) => mutation.state as { data?: SyncResult; error: Error | null },
  }).at(-1);
  const problem = last?.error?.message ?? last?.data?.problem;

  return (
    <div className="flex flex-wrap items-center gap-s">
      {running ? (
        <span className="flex items-center gap-xs font-ui text-s text-neutral-7" role="status">
          <Spinner aria-hidden />
          {m.sync_running()}
        </span>
      ) : problem ? (
        <span className="font-ui text-s text-error">{problem}</span>
      ) : last?.data ? (
        <span className="font-ui text-s text-neutral-7">{summary(last.data)}</span>
      ) : null}
      <Button
        variant="outline"
        title={m.sync_now_hint()}
        disabled={running}
        onClick={() => sync.mutate({})}
      >
        <RefreshIcon aria-hidden />
        {m.sync_now()}
      </Button>
    </div>
  );
}
