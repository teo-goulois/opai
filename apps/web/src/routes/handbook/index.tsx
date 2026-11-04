import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { HandbookIndex, HandbookIndexSkeleton } from "@/components/handbook/handbook-index";
import { RouteError } from "@/components/shared/route-error";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/handbook/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(orpc.handbook.get.queryOptions()),
  pendingComponent: HandbookIndexSkeleton,
  errorComponent: RouteError,
  component: HandbookPage,
});

function HandbookPage() {
  const { data: handbook } = useSuspenseQuery(orpc.handbook.get.queryOptions());
  return <HandbookIndex handbook={handbook} />;
}
