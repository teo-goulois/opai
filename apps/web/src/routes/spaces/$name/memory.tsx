import { createFileRoute } from "@tanstack/react-router";

import { SpaceMemory } from "@/components/spaces/space-records";

export const Route = createFileRoute("/spaces/$name/memory")({
  component: function SpaceMemoryPage() {
    const { name } = Route.useParams();
    return <SpaceMemory name={name} />;
  },
});
