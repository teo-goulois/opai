import { Button } from "@opai/ui/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@opai/ui/components/ui/empty";
import { ORPCError } from "@orpc/client";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";

import { RouteError } from "@/components/shared/route-error";
import { SkillDetailSkeleton, SkillDocument } from "@/components/skills/skill-detail";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

const skillQuery = (name: string) => orpc.skills.get.queryOptions({ input: { name } });

export const Route = createFileRoute("/skills/$name")({
  validateSearch: z.object({
    view: z.enum(["preview", "markdown"]).optional().catch(undefined),
  }),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(skillQuery(params.name));
    } catch (error) {
      if (
        error instanceof ORPCError &&
        (error.code === "NOT_FOUND" || error.code === "BAD_REQUEST")
      ) {
        throw notFound();
      }
      throw error;
    }
  },
  pendingComponent: SkillDetailSkeleton,
  errorComponent: RouteError,
  notFoundComponent: SkillNotFound,
  component: SkillPage,
});

function SkillPage() {
  const { name } = Route.useParams();
  const { view = "preview" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const query = skillQuery(name);
  const { data: skill } = useSuspenseQuery(query);
  const spaces = useQuery(orpc.skills.list.queryOptions());
  const save = useMutation(
    orpc.skills.save.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: orpc.skills.key() }),
    }),
  );

  return (
    <SkillDocument
      skill={skill}
      spaces={spaces.data?.spaces.map((space) => space.name) ?? [skill.space]}
      view={view}
      onViewChange={(next) =>
        void navigate({ search: { view: next === "preview" ? undefined : next }, replace: true })
      }
      onSave={(markdown, baseHash) => save.mutateAsync({ name, markdown, baseHash })}
      onReload={() => queryClient.refetchQueries({ queryKey: query.queryKey })}
    />
  );
}

function SkillNotFound() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{m.skill_not_found_title()}</EmptyTitle>
        <EmptyDescription>{m.skill_not_found_description()}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" render={<Link to="/skills" />}>
          {m.skills_back()}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
