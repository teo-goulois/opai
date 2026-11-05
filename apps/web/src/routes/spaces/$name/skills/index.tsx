import { createFileRoute } from "@tanstack/react-router";

import { SpaceSkills } from "@/components/skills/skill-list";

export const Route = createFileRoute("/spaces/$name/skills/")({
  component: function SpaceSkillsPage() {
    const { name } = Route.useParams();
    return <SpaceSkills name={name} />;
  },
});
