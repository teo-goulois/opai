import { createFileRoute } from "@tanstack/react-router";

import { SpaceRules } from "@/components/rules/space-rules";

export const Route = createFileRoute("/spaces/$name/rules/")({
  component: function SpaceRulesPage() {
    const { name } = Route.useParams();
    return <SpaceRules name={name} />;
  },
});
