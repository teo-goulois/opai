import { createFileRoute } from "@tanstack/react-router";

import { SpaceIssues } from "@/components/spaces/space-records";

export const Route = createFileRoute("/spaces/$name/issues")({
  component: function SpaceIssuesPage() {
    const { name } = Route.useParams();
    return <SpaceIssues name={name} />;
  },
});
