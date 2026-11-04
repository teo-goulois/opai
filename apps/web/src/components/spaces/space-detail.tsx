import type { IssueEntry, JournalEntry, SpaceDetail as Space } from "@opai/context/space-view";
import { Badge } from "@opai/ui/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@opai/ui/components/ui/breadcrumb";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@opai/ui/components/ui/collapsible";
import { Markdown } from "@opai/ui/components/ui/markdown";
import {
  PageHeader,
  PageMeta,
  PageSection,
  PageSectionTitle,
  PageTitle,
} from "@opai/ui/components/ui/page-header";
import { Skeleton } from "@opai/ui/components/ui/skeleton";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { m } from "@/paraglide/messages.js";
import { formatRelative } from "@/utils/format";

import { SpaceRoleBadges, spaceFolders } from "./space-list";

const listClassName =
  "flex flex-col overflow-hidden rounded-m bg-neutral-1 edge-outer dark:bg-neutral-2";
const rowClassName =
  "flex flex-col gap-xxs px-m py-s in-[li:not(:first-child)]:edge-top in-[li:not(:first-child)]:edge-neutral-4";
const linkClassName =
  "w-fit rounded-xs font-ui text-m font-medium text-neutral-10 underline decoration-transparent underline-offset-4 transition-colors hover:decoration-neutral-10";

export function SpaceDetail({ space }: { space: Space }) {
  return (
    <article className="flex flex-col gap-xl">
      <div className="flex flex-col gap-m">
        <Breadcrumb aria-label={m.breadcrumb()}>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/spaces" />}>{m.nav_spaces()}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{space.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <PageHeader>
          <PageTitle>{space.name}</PageTitle>
          {space.base || space.default ? (
            <PageMeta>
              <SpaceRoleBadges space={space} />
              <span>{space.base ? m.space_base_hint() : m.space_default_hint()}</span>
            </PageMeta>
          ) : null}
        </PageHeader>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-xl lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex flex-col gap-xl">
          <Section id="space-rules" title={m.space_rules()} count={space.ruleFiles.length}>
            {space.ruleFiles.length > 0 ? (
              <ul className={listClassName}>
                {space.ruleFiles.map((rule) => (
                  <li key={rule.id} className={rowClassName}>
                    <Link to="/rules/$id" params={{ id: rule.id }} className={linkClassName}>
                      {rule.title}
                    </Link>
                    <span className="font-data text-s text-neutral-7">{rule.path}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Hint>{m.space_rules_none({ path: `spaces/${space.name}/AGENTS.md` })}</Hint>
            )}
          </Section>

          <Section
            id="space-memory"
            title={m.space_memory()}
            count={space.facts.length}
            hint={m.space_memory_hint({ path: `spaces/${space.name}/context/memory/` })}
          >
            {space.facts.length > 0 ? (
              <ul className={listClassName}>
                {space.facts.map((fact) => (
                  <li key={fact.path} className={rowClassName}>
                    <span className="font-ui text-m font-medium text-neutral-10">{fact.title}</span>
                    <span className="font-data text-s text-neutral-7">{fact.path}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Hint>{m.space_memory_none()}</Hint>
            )}
          </Section>

          <Section
            id="space-journal"
            title={m.space_journal()}
            count={space.journal.length}
            hint={m.space_journal_hint()}
          >
            {space.journal.length > 0 ? (
              <ul className="flex flex-col gap-xs">
                {space.journal.map((entry) => (
                  <li key={entry.path}>
                    <JournalRow entry={entry} />
                  </li>
                ))}
              </ul>
            ) : (
              <Hint>{m.space_journal_none()}</Hint>
            )}
          </Section>

          <Section
            id="space-issues"
            title={m.space_issues_title()}
            count={space.issues.length}
            hint={m.space_issues_hint()}
          >
            {space.issues.length > 0 ? (
              <ul className="flex flex-col gap-xs">
                {space.issues.map((issue) => (
                  <li key={issue.path}>
                    <IssueRow issue={issue} />
                  </li>
                ))}
              </ul>
            ) : (
              <Hint>{m.space_issues_none()}</Hint>
            )}
          </Section>
        </div>

        <aside className="flex flex-col gap-l lg:sticky lg:top-xl lg:self-start">
          <PageSection>
            <PageSectionTitle>{m.space_folders()}</PageSectionTitle>
            <ul className="flex flex-col gap-xxs font-data text-s text-neutral-10">
              {spaceFolders(space).map((folder) => (
                <li key={folder} className="break-all">
                  {folder}
                </li>
              ))}
            </ul>
            {!space.base && !space.default && space.paths.length === 0 ? (
              <Hint>{m.space_folders_none()}</Hint>
            ) : null}
          </PageSection>

          {space.disable.length > 0 ? (
            <PageSection>
              <PageSectionTitle>{m.space_modules_off()}</PageSectionTitle>
              <ul className="flex flex-wrap gap-xxs">
                {space.disable.map((name) => (
                  <li key={name}>
                    <Badge variant="neutral">{name}</Badge>
                  </li>
                ))}
              </ul>
            </PageSection>
          ) : null}
        </aside>
      </div>
    </article>
  );
}

function Section({
  id,
  title,
  count,
  hint,
  children,
}: {
  id: string;
  title: string;
  count: number;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <PageSection aria-labelledby={id}>
      <div className="flex flex-col gap-xxs">
        <PageSectionTitle id={id} count={count}>
          {title}
        </PageSectionTitle>
        {hint ? <p className="max-w-prose font-ui text-s text-neutral-7">{hint}</p> : null}
      </div>
      {children}
    </PageSection>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="font-ui text-s text-neutral-7">{children}</p>;
}

/** Who wrote a record, where, and when. */
function Byline({ agent, machine, date }: { agent: string; machine: string; date: string }) {
  return (
    <span className="font-ui text-s text-neutral-7">
      {[agent, machine, date ? formatRelative(date) : ""].filter(Boolean).join(" · ")}
    </span>
  );
}

const statusVariant: Record<string, "success" | "warning" | "error" | "neutral"> = {
  validated: "success",
  implemented: "neutral",
  planned: "neutral",
  blocked: "error",
};

function JournalRow({ entry }: { entry: JournalEntry }) {
  return (
    <Collapsible className="rounded-m bg-neutral-1 edge-outer dark:bg-neutral-2">
      <CollapsibleTrigger className="w-full px-m py-s">
        <span className="flex min-w-0 flex-1 flex-col items-start gap-xxs text-start">
          <span className="flex flex-wrap items-center gap-xs">
            <span className="font-ui text-m font-medium text-neutral-10">{entry.title}</span>
            {entry.status ? (
              <Badge variant={statusVariant[entry.status] ?? "neutral"}>{entry.status}</Badge>
            ) : null}
            {entry.relevance ? (
              <Badge variant="neutral" title={m.space_journal_relevance()}>
                {entry.relevance}
              </Badge>
            ) : null}
          </span>
          <span className="font-ui text-s text-neutral-8">{entry.project}</span>
          <Byline agent={entry.agent} machine={entry.machine} date={entry.date} />
        </span>
      </CollapsibleTrigger>
      <CollapsiblePanel variant="plain">
        <div className="px-m pb-s">
          <Markdown>{entry.body}</Markdown>
          <p className="pt-xs font-data text-s text-neutral-7">{entry.path}</p>
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}

function IssueRow({ issue }: { issue: IssueEntry }) {
  return (
    <Collapsible className="rounded-m bg-neutral-1 edge-outer dark:bg-neutral-2">
      <CollapsibleTrigger className="w-full px-m py-s">
        <span className="flex min-w-0 flex-1 flex-col items-start gap-xxs text-start">
          <span className="flex flex-wrap items-center gap-xs">
            <span className="font-ui text-m font-medium text-neutral-10">{issue.title}</span>
            <Badge variant={issue.occurrences >= 3 ? "warning" : "neutral"}>
              {m.space_issue_occurrences({ count: issue.occurrences })}
            </Badge>
          </span>
          <span className="font-data text-s text-neutral-8">{issue.key}</span>
          <Byline agent={issue.agent} machine={issue.machine} date={issue.date} />
        </span>
      </CollapsibleTrigger>
      <CollapsiblePanel variant="plain">
        <div className="px-m pb-s">
          <Markdown>{issue.body}</Markdown>
          <p className="pt-xs font-data text-s text-neutral-7">{issue.path}</p>
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}

export function SpaceDetailSkeleton() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true">
      <div className="flex flex-col gap-xs">
        <Skeleton className="h-(--line-s) w-24" />
        <Skeleton className="h-(--line-l) w-40" />
      </div>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
