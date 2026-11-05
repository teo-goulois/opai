import { createFileRoute } from "@tanstack/react-router";

import { SpaceOverview } from "@/components/spaces/space-overview";

export const Route = createFileRoute("/spaces/$name/")({
  component: function SpaceOverviewPage() {
    const { name } = Route.useParams();
    return <SpaceOverview name={name} />;
  },
});
