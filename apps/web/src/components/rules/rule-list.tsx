import type { RuleSummary } from "@opai/context/rules";
import type { SpaceConfig } from "@opai/context/space-view";
import { Badge } from "@opai/ui/components/ui/badge";
import {
  PageHeader,
  PageMeta,
  PageSection,
  PageSectionTitle,
  PageTitle,
} from "@opai/ui/components/ui/page-header";
import { Skeleton } from "@opai/ui/components/ui/skeleton";
import { Link } from "@tanstack/react-router";

import { m } from "@/paraglide/messages.js";

type RuleGroup = { id: string; title: string; hint: string; rules: RuleSummary[] };

/** One group per space, the base one first, then the rules of this repository. */
function groupRules(rules: RuleSummary[], spaces: SpaceConfig[]): RuleGroup[] {
  const names = [
    ...spaces.map((space) => space.name),
    ...rules.flatMap((rule) => (rule.space ? [rule.space] : [])),
  ].filter((name, index, all) => all.indexOf(name) === index);
  const groups = names.map((name) => {
    const base = spaces.find((space) => space.name === name)?.base === true;
    return {
      id: `space-${name}`,
      title: base ? m.rules_scope_global() : m.rules_scope_space({ space: name }),
      hint: base ? m.rules_scope_global_hint() : m.rules_scope_space_hint({ space: name }),
      rules: rules.filter((rule) => rule.space === name),
    };
  });
  groups.push({
    id: "repository",
    title: m.rules_scope_repository(),
    hint: m.rules_scope_repository_hint(),
    rules: rules.filter((rule) => rule.space === undefined),
  });
  return groups.filter((group) => group.rules.length > 0);
}

export function RuleList({ rules, spaces }: { rules: RuleSummary[]; spaces: SpaceConfig[] }) {
  return (
    <div className="flex flex-col gap-xl">
      <PageHeader>
        <PageTitle>{m.rules_title()}</PageTitle>
        <PageMeta>{m.rules_count({ count: rules.length })}</PageMeta>
      </PageHeader>

      {groupRules(rules, spaces).map((group) => (
        <PageSection key={group.id} aria-labelledby={`rules-${group.id}`}>
          <div className="flex flex-col gap-xxs">
            <PageSectionTitle id={`rules-${group.id}`} count={group.rules.length}>
              {group.title}
            </PageSectionTitle>
            <p className="font-ui text-s text-neutral-7">{group.hint}</p>
          </div>
          <ul className="flex flex-col overflow-hidden rounded-m bg-neutral-1 edge-outer dark:bg-neutral-2">
            {group.rules.map((rule) => (
              <li key={rule.id}>
                <RuleRow rule={rule} />
              </li>
            ))}
          </ul>
        </PageSection>
      ))}
    </div>
  );
}

function RuleRow({ rule }: { rule: RuleSummary }) {
  return (
    <div className="flex flex-col gap-xs px-m py-s in-[li:not(:first-child)]:edge-top in-[li:not(:first-child)]:edge-neutral-4">
      <div className="flex flex-col gap-xxs">
        <Link
          to="/rules/$id"
          params={{ id: rule.id }}
          className="w-fit rounded-xs font-ui text-m font-medium text-neutral-10 underline decoration-transparent underline-offset-4 transition-colors hover:decoration-neutral-10"
        >
          {rule.title}
        </Link>
        <span className="font-data text-s text-neutral-7">
          {rule.path}
          {rule.pointsTo ? ` → ${m.rules_points_to({ file: rule.pointsTo })}` : ""}
        </span>
      </div>
      {rule.summary ? (
        <p className="max-w-prose font-ui text-s text-neutral-8">{rule.summary}</p>
      ) : null}
      {rule.sections.length > 0 ? (
        <ul className="flex flex-wrap gap-xxs">
          {rule.sections.map((section) => (
            <li key={section.id}>
              <Badge
                variant="neutral"
                className="transition-colors hover:bg-neutral-4 hover:text-neutral-10 focus-visible:focus-ring"
                render={<Link to="/rules/$id" params={{ id: rule.id }} hash={section.id} />}
              >
                {section.title}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function RuleListSkeleton() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true">
      <div className="flex flex-col gap-xs">
        <Skeleton className="h-(--line-l) w-32" />
        <Skeleton className="h-(--line-s) w-20" />
      </div>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
