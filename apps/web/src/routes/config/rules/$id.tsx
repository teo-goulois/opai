import { Button } from "@opai/ui/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@opai/ui/components/ui/breadcrumb";
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

import { RuleDocument, ruleQuery } from "@/components/rules/rule-document";
import { RouteError } from "@/components/shared/route-error";
import { m } from "@/paraglide/messages.js";

/** The instance's own rule files: for agents working in the instance itself. */
export const Route = createFileRoute("/config/rules/$id")({
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
    if (rule.space) {
      throw redirect({ to: "/spaces/$name/rules/$id", params: { name: rule.space, id: rule.id } });
    }
  },
  errorComponent: RouteError,
  notFoundComponent: RuleNotFound,
  component: InstanceRulePage,
});

function InstanceRulePage() {
  const { id } = Route.useParams();
  const { view = "preview" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: rule } = useSuspenseQuery(ruleQuery(id));
  const target = rule.pointsTo?.toLowerCase().replace(/\.md$/, "-md");

  return (
    <RuleDocument
      id={id}
      view={view}
      onViewChange={(next) =>
        void navigate({ search: { view: next === "preview" ? undefined : next }, replace: true })
      }
      crumbs={
        <Breadcrumb aria-label={m.breadcrumb()}>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/config" />}>{m.nav_config()}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{rule.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
      meta={
        rule.pointsTo && target ? (
          <Link
            to="/config/rules/$id"
            params={{ id: target }}
            className="rounded-xs underline decoration-neutral-5 underline-offset-4 transition-colors hover:text-neutral-10 hover:decoration-neutral-10"
          >
            {m.rules_points_to({ file: rule.pointsTo })}
          </Link>
        ) : null
      }
    />
  );
}

function RuleNotFound() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{m.rule_not_found_title()}</EmptyTitle>
        <EmptyDescription>{m.rule_not_found_description()}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" render={<Link to="/config" />}>
          {m.config_back()}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
