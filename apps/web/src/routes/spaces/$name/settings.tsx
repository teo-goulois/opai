import { createFileRoute } from "@tanstack/react-router";

import { SpaceSettings } from "@/components/spaces/space-settings";

export const Route = createFileRoute("/spaces/$name/settings")({
  component: function SpaceSettingsPage() {
    const { name } = Route.useParams();
    return <SpaceSettings name={name} />;
  },
});
