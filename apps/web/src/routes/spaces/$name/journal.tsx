import { createFileRoute } from "@tanstack/react-router";

import { SpaceJournal } from "@/components/spaces/space-records";

export const Route = createFileRoute("/spaces/$name/journal")({
  component: function SpaceJournalPage() {
    const { name } = Route.useParams();
    return <SpaceJournal name={name} />;
  },
});
