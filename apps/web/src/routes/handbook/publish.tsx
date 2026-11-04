import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { HandbookPublish } from "@/components/handbook/handbook-publish";
import { RouteError } from "@/components/shared/route-error";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/handbook/publish")({
  errorComponent: RouteError,
  component: PublishPage,
});

function PublishPage() {
  const queryClient = useQueryClient();
  // Runs the export in the app's clone: a few seconds, so never on a hover or a
  // refocus, and always fresh when the page opens.
  const options = orpc.handbook.publishPreview.queryOptions({
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const preview = useQuery(options);
  const publish = useMutation(
    orpc.handbook.publish.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: options.queryKey }),
    }),
  );

  return (
    <HandbookPublish
      preview={
        preview.data
          ? { status: "ready", preview: preview.data, refreshing: preview.isFetching }
          : preview.error
            ? { status: "error", message: preview.error.message }
            : { status: "loading" }
      }
      onCompare={() => void preview.refetch()}
      onPublish={(diffHash) => publish.mutateAsync({ diffHash })}
    />
  );
}
