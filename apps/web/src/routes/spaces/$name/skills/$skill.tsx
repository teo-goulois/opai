import { Button } from "@opai/ui/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@opai/ui/components/ui/empty";
import { ORPCError } from "@orpc/client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { RouteError } from "@/components/shared/route-error";
import { SkillDetailSkeleton, SkillDocument } from "@/components/skills/skill-detail";
import { useSpaceData } from "@/components/spaces/space-data";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

const skillQuery = (name: string) => orpc.skills.get.queryOptions({ input: { name } });

export const Route = createFileRoute("/spaces/$name/skills/$skill")({
  validateSearch: z.object({
    tab: z.enum(["settings", "instructions", "source"]).optional().catch(undefined),
    view: z.enum(["preview", "markdown"]).optional().catch(undefined),
  }),
  loader: async ({ context, params }) => {
    let skill;
    try {
      skill = await context.queryClient.ensureQueryData(skillQuery(params.skill));
    } catch (error) {
      if (
        error instanceof ORPCError &&
        (error.code === "NOT_FOUND" || error.code === "BAD_REQUEST")
      ) {
        throw notFound();
      }
      throw error;
    }
    // A skill lives in one space: its page is under that space.
    if (skill.space !== params.name) {
      throw redirect({
        to: "/spaces/$name/skills/$skill",
        params: { name: skill.space, skill: skill.name },
      });
    }
  },
  pendingComponent: SkillDetailSkeleton,
  errorComponent: RouteError,
  notFoundComponent: SkillNotFound,
  component: SkillPage,
});

function SkillPage() {
  const { name, skill: skillName } = Route.useParams();
  const { tab = "settings", view = "preview" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: skill } = useSuspenseQuery(skillQuery(skillName));
  const { spaces } = useSpaceData(name);

  return (
    <SkillDocument
      key={skill.name}
      skill={skill}
      spaces={spaces.map((space) => space.name)}
      tab={tab}
      onTabChange={(next) =>
        void navigate({
          search: (prev) => ({ ...prev, tab: next === "settings" ? undefined : next }),
          replace: true,
        })
      }
      view={view}
      onViewChange={(next) =>
        void navigate({
          search: (prev) => ({ ...prev, view: next === "preview" ? undefined : next }),
          replace: true,
        })
      }
    />
  );
}

function SkillNotFound() {
  const { name } = Route.useParams();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{m.skill_not_found_title()}</EmptyTitle>
        <EmptyDescription>{m.skill_not_found_description()}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" render={<Link to="/spaces/$name/skills" params={{ name }} />}>
          {m.skills_back()}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
