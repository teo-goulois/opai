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

import { ModuleSwitch } from "@/components/rules/space-rules";
import { RuleDocument, ruleQuery } from "@/components/rules/rule-document";
import { RouteError } from "@/components/shared/route-error";
import { moduleName, useSpaceData } from "@/components/spaces/space-data";
import { SpaceCrumbs, SpaceDot } from "@/components/spaces/space-ui";
import { m } from "@/paraglide/messages.js";

export const Route = createFileRoute("/spaces/$name/rules/$id")({
  validateSearch: z.object({
    view: z.enum(["preview", "markdown"]).optional().catch(undefined),
  }),
  loader: async ({ context, params }) => {
    let rule;
    try {
      rule = await context.queryClient.ensureQueryData(ruleQuery(params.id));
    } catch (error) {
      if (
        error instanceof ORPCError &&
        (error.code === "NOT_FOUND" || error.code === "BAD_REQUEST")
      ) {
        throw notFound();
      }
      throw error;
    }
    // A rule lives in one space; the instance's own rules are in Config.
    if (!rule.space) throw redirect({ to: "/config/rules/$id", params: { id: rule.id } });
    if (rule.space !== params.name) {
      throw redirect({
        to: "/spaces/$name/rules/$id",
        params: { name: rule.space, id: rule.id },
      });
    }
  },
  errorComponent: RouteError,
  notFoundComponent: RuleNotFound,
  component: RulePage,
});

function RulePage() {
  const { name, id } = Route.useParams();
  const { view = "preview" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { space, spaces } = useSpaceData(name);
  const { data: rule } = useSuspenseQuery(ruleQuery(id));
  const module = space.base ? moduleName(rule) : undefined;
  const others = spaces.filter((item) => !item.base);

  return (
    <RuleDocument
      id={id}
      view={view}
      onViewChange={(next) =>
        void navigate({ search: { view: next === "preview" ? undefined : next }, replace: true })
      }
      crumbs={
        <SpaceCrumbs
          space={name}
          section={{ label: m.space_rules(), to: "/spaces/$name/rules" }}
          page={rule.title}
        />
      }
      meta={module ? <span>{m.rule_module()}</span> : null}
    >
      {module && others.length > 0 ? (
        <section aria-labelledby="module-spaces" className="flex flex-col gap-s">
          <h2 id="module-spaces" className="font-ui text-s font-medium text-neutral-7">
            {m.rule_module_active_in()}
          </h2>
          <ul className="flex flex-wrap gap-x-xl gap-y-s">
            {others.map((other) => (
              <li key={other.name}>
                <label className="flex items-center gap-s font-ui text-m text-neutral-10">
                  <ModuleSwitch
                    space={other}
                    module={module}
                    label={m.rule_module_in({ module: rule.title, space: other.name })}
                  />
                  <span className="flex items-center gap-xs">
                    <SpaceDot index={spaces.indexOf(other)} />
                    {other.name}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </RuleDocument>
  );
}

function RuleNotFound() {
  const { name } = Route.useParams();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{m.rule_not_found_title()}</EmptyTitle>
        <EmptyDescription>{m.rule_not_found_description()}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" render={<Link to="/spaces/$name/rules" params={{ name }} />}>
          {m.rules_back()}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
