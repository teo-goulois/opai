import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { SkillList, SkillListSkeleton } from "@/components/skills/skill-list";
import { orpc } from "@/utils/orpc";

const skillsQuery = orpc.skills.list.queryOptions();

export const Route = createFileRoute("/skills/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(skillsQuery),
  pendingComponent: SkillListSkeleton,
  errorComponent: RouteError,
  component: SkillsPage,
});

function SkillsPage() {
  const { data } = useSuspenseQuery(skillsQuery);
  return (
    <SkillList
      skills={data.skills}
      spaces={data.spaces}
      since={data.since}
      problems={data.problems}
    />
  );
}
