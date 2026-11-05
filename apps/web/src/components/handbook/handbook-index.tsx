import type { Handbook, HandbookEntry, HandbookPageSummary } from "@opai/context/handbook/pages";
import { Badge } from "@opai/ui/components/ui/badge";
import { Button } from "@opai/ui/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@opai/ui/components/ui/empty";
import {
  PageDescription,
  PageHeader,
  PageMeta,
  PageSection,
  PageSectionTitle,
  PageTitle,
} from "@opai/ui/components/ui/page-header";
import { Skeleton } from "@opai/ui/components/ui/skeleton";
import { cn } from "@opai/ui/lib/utils";
import { ExternalLinkIcon, HandbookIcon, PullRequestIcon, WarningIcon } from "@opai/ui/icon";
import { Link } from "@tanstack/react-router";

import { m } from "@/paraglide/messages.js";

export function HandbookIndex({ handbook }: { handbook: Handbook }) {
  if (handbook.status === "missing") return <HandbookMissing />;

  return (
    <div className="flex flex-col gap-xl">
      <PageHeader>
        <div className="flex flex-wrap items-start justify-between gap-m">
          <div className="flex min-w-0 flex-col gap-xs">
            <PageTitle>{m.handbook_title()}</PageTitle>
            <PageDescription>{m.handbook_description()}</PageDescription>
          </div>
          {handbook.publishable ? (
            <Button variant="outline" render={<Link to="/handbook/publish" />}>
              <PullRequestIcon data-slot="icon" aria-hidden />
              {m.handbook_publish()}
            </Button>
          ) : null}
        </div>
        <PageMeta>
          <span>{m.handbook_pages_count({ count: handbook.pages.length })}</span>
          <span>handbook/</span>
          {handbook.site ? (
            <a
              href={handbook.site}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-xxs underline decoration-transparent underline-offset-4 hover:decoration-current"
            >
              {new URL(handbook.site).host + new URL(handbook.site).pathname.replace(/\/$/, "")}
              <ExternalLinkIcon aria-hidden />
            </a>
          ) : null}
        </PageMeta>
      </PageHeader>

      {handbook.sections.map((section, index) => (
        <PageSection key={section.title} aria-labelledby={`handbook-section-${index}`}>
          <PageSectionTitle id={`handbook-section-${index}`} count={section.entries.length}>
            {section.title}
          </PageSectionTitle>
          <ul className="-mx-s flex flex-col gap-xxs">
            {section.entries.map((entry) => (
              <li key={entry.kind === "page" ? entry.page.slug : entry.url}>
                <EntryRow entry={entry} />
              </li>
            ))}
          </ul>
        </PageSection>
      ))}
    </div>
  );
}

export function GeneratedBadge({ page }: { page: Pick<HandbookPageSummary, "generated"> }) {
  if (!page.generated) return null;
  return <Badge variant="accent">{m.handbook_generated()}</Badge>;
}

const indent = ["", "ps-xl", "ps-[calc(var(--space-xl)*2)]"];

function EntryRow({ entry }: { entry: HandbookEntry }) {
  const row = cn(
    "flex flex-col gap-xxs rounded-s px-s py-xs",
    indent[Math.min(entry.depth, indent.length - 1)],
  );
  const title =
    "w-fit rounded-xs font-ui text-m font-medium text-neutral-10 underline decoration-transparent underline-offset-4 transition-colors hover:decoration-neutral-10";

  if (entry.kind === "link") {
    return (
      <div className={row}>
        <a
          href={entry.url}
          target="_blank"
          rel="noreferrer"
          className={cn(title, "inline-flex items-center gap-xxs")}
        >
          {entry.title}
          <ExternalLinkIcon aria-hidden className="text-neutral-7" />
        </a>
        <span className="font-ui text-s text-neutral-7">{m.handbook_on_site()}</span>
        <p className="max-w-prose font-ui text-s text-neutral-8">{entry.description}</p>
      </div>
    );
  }

  const { page } = entry;
  return (
    <div className={row}>
      <div className="flex flex-wrap items-center gap-xs">
        <Link to="/handbook/$" params={{ _splat: page.slug }} className={title}>
          {page.title}
        </Link>
        <GeneratedBadge page={page} />
      </div>
      <span className="font-ui text-s text-neutral-7 wrap-anywhere">{page.path}</span>
      <p className="max-w-prose font-ui text-s text-neutral-8">{page.description}</p>
    </div>
  );
}

function HandbookMissing() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia>
          <HandbookIcon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{m.handbook_missing_title()}</EmptyTitle>
        <EmptyDescription>{m.handbook_missing_description()}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <span className="font-ui text-s text-neutral-8">handbook/index.md</span>
      </EmptyContent>
    </Empty>
  );
}

export function ErrorNote({ title, message }: { title?: string; message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-xs rounded-s bg-error-transparent p-s font-ui text-s text-neutral-10"
    >
      <WarningIcon aria-hidden className="mt-xxs shrink-0" />
      <span className="min-w-0 flex-1 whitespace-pre-wrap wrap-anywhere">
        {title ? <span className="font-medium">{title}. </span> : null}
        {message}
      </span>
    </div>
  );
}

export function HandbookIndexSkeleton() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true">
      <div className="flex flex-col gap-xs">
        <Skeleton className="h-(--line-l) w-32" />
        <Skeleton className="h-(--line-s) w-72" />
      </div>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
