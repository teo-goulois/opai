import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { MachineList, MachineListSkeleton } from "@/components/machines/machine-list";
import { RouteError } from "@/components/shared/route-error";
import { skillsQuery } from "@/components/spaces/space-data";
import { orpc } from "@/utils/orpc";

const machinesQuery = orpc.machines.list.queryOptions();

export const Route = createFileRoute("/machines/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(machinesQuery),
      context.queryClient.ensureQueryData(skillsQuery),
    ]),
  pendingComponent: MachineListSkeleton,
  errorComponent: RouteError,
  component: MachinesPage,
});

function MachinesPage() {
  const { data: machines } = useSuspenseQuery(machinesQuery);
  const { data } = useSuspenseQuery(skillsQuery);
  return <MachineList machines={machines} skills={data.skills} />;
}
