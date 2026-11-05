import type { SpaceConfig, SpaceSummary } from "@opai/context/space-view";
import { Badge } from "@opai/ui/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@opai/ui/components/ui/breadcrumb";
import { PageDescription, PageHeader, PageTitle } from "@opai/ui/components/ui/page-header";
import { tabLinkClassName, tabLinkListClassName } from "@opai/ui/components/ui/tabs";
import { cn } from "@opai/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { Fragment, type ReactNode } from "react";

import { m } from "@/paraglide/messages.js";

/** The base space first, then the default one, then the others by name. */
export function orderSpaces<T extends Pick<SpaceConfig, "name" | "base" | "default">>(spaces: T[]) {
  const rank = (space: T) => (space.base ? 0 : space.default ? 1 : 2);
  return [...spaces].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

const dotColors = ["bg-color-1", "bg-color-2", "bg-color-3", "bg-color-4"];

/** A space keeps the same color everywhere: its rank in `orderSpaces`. */
export function SpaceDot({ index, className }: { index: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("size-xs shrink-0 rounded-xs", dotColors[index % dotColors.length], className)}
    />
  );
}

/** Base and default badges, with what they mean on hover. */
export function SpaceRoleBadge({ space }: { space: SpaceConfig }) {
  if (space.base) {
    return (
      <Badge variant="accent" title={m.space_base_hint()}>
        {m.space_base()}
      </Badge>
    );
  }
  if (space.default) {
    return (
      <Badge variant="neutral" title={m.space_default_hint()}>
        {m.space_default()}
      </Badge>
    );
  }
  return null;
}

/** The folders of a space, as one line each. */
export function spaceFolders(space: SpaceConfig) {
  if (space.base) return [m.space_folders_every()];
  return space.default ? [...space.paths, m.space_folders_rest()] : space.paths;
}

/** The pages of a space that take only its name. */
export type SpacePath =
  | "/spaces/$name"
  | "/spaces/$name/rules"
  | "/spaces/$name/skills"
  | "/spaces/$name/memory"
  | "/spaces/$name/journal"
  | "/spaces/$name/issues";

/** The title of a space and its sections. */
export function SpaceHeader({
  space,
  skills,
  actions,
}: {
  space: SpaceSummary;
  /** Its own skills, counted on the Skills tab. */
  skills: number;
  actions?: ReactNode;
}) {
  const params = { name: space.name };
  const tabs: { to: SpacePath; label: string; count?: number; exact?: boolean }[] = [
    { to: "/spaces/$name", label: m.space_overview(), exact: true },
    { to: "/spaces/$name/rules", label: m.space_rules(), count: space.counts.rules },
    { to: "/spaces/$name/skills", label: m.nav_skills(), count: skills },
    { to: "/spaces/$name/memory", label: m.space_memory(), count: space.counts.facts },
    { to: "/spaces/$name/journal", label: m.space_journal(), count: space.counts.journal },
    { to: "/spaces/$name/issues", label: m.space_issues_title(), count: space.counts.issues },
  ];

  return (
    <div className="flex flex-col gap-l">
      <PageHeader>
        <div className="flex flex-wrap items-center justify-between gap-s">
          <div className="flex min-w-0 items-center gap-xs">
            <PageTitle>{space.name}</PageTitle>
            <SpaceRoleBadge space={space} />
          </div>
          {actions}
        </div>
        {space.description ? (
          <PageDescription className="text-pretty">{space.description}</PageDescription>
        ) : null}
      </PageHeader>
      <nav aria-label={space.name} className={tabLinkListClassName}>
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            params={params}
            activeOptions={{ exact: tab.exact ?? false }}
            className={tabLinkClassName}
          >
            {tab.label}
            {tab.count ? (
              <span className="font-ui text-s text-neutral-6 tabular-nums">{tab.count}</span>
            ) : null}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** space › section › page. The space links to its overview, the section to its tab. */
export function SpaceCrumbs({
  space,
  section,
  page,
}: {
  space: string;
  section?: { label: string; to: SpacePath };
  page: string;
}) {
  const links: { label: string; to: SpacePath }[] = [
    { label: space, to: "/spaces/$name" },
    ...(section ? [section] : []),
  ];
  return (
    <Breadcrumb aria-label={m.breadcrumb()}>
      <BreadcrumbList>
        {links.map((link) => (
          <Fragment key={link.label}>
            <BreadcrumbItem>
              <BreadcrumbLink
                render={
                  <Link to={link.to} params={{ name: space }} activeOptions={{ exact: true }} />
                }
              >
                {link.label}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </Fragment>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage>{page}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** Short muted text: a hint under a section title, or an empty state. */
export function Hint({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("max-w-prose font-ui text-s text-pretty text-neutral-7", className)}>
      {children}
    </p>
  );
}
