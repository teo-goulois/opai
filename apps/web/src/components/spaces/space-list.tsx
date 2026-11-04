import type { SpaceConfig, SpaceSummary } from "@opai/context/space-view";
import { Badge } from "@opai/ui/components/ui/badge";
import { PageHeader, PageMeta, PageTitle } from "@opai/ui/components/ui/page-header";
import { Skeleton } from "@opai/ui/components/ui/skeleton";
import { Link } from "@tanstack/react-router";

import { m } from "@/paraglide/messages.js";

/** Base and default badges, with what they mean on hover. */
export function SpaceRoleBadges({ space }: { space: SpaceConfig }) {
  return (
    <>
      {space.base ? (
        <Badge variant="accent" title={m.space_base_hint()}>
          {m.space_base()}
        </Badge>
      ) : null}
      {space.default ? (
        <Badge variant="neutral" title={m.space_default_hint()}>
          {m.space_default()}
        </Badge>
      ) : null}
    </>
  );
}

/** The folders of a space, as one line each. */
export function spaceFolders(space: SpaceConfig) {
  if (space.base) return [m.space_folders_every()];
  return space.default ? [...space.paths, m.space_folders_rest()] : space.paths;
}

/** What a space holds, as short counts. Zero counts are left out. */
function spaceCounts(space: SpaceSummary) {
  const { rules, facts, journal, issues } = space.counts;
  return [
    rules > 0 && m.space_rule_files({ count: rules }),
    facts > 0 && m.space_facts({ count: facts }),
    journal > 0 && m.space_journal_entries({ count: journal }),
    issues > 0 && m.space_issues({ count: issues }),
  ].filter((count) => count !== false);
}

export function SpaceList({ spaces }: { spaces: SpaceSummary[] }) {
  return (
    <div className="flex flex-col gap-xl">
      <PageHeader>
        <PageTitle>{m.spaces_title()}</PageTitle>
        <PageMeta>{m.spaces_count({ count: spaces.length })}</PageMeta>
      </PageHeader>

      <ul className="flex flex-col overflow-hidden rounded-m bg-neutral-1 edge-outer dark:bg-neutral-2">
        {spaces.map((space) => (
          <li key={space.name}>
            <SpaceRow space={space} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SpaceRow({ space }: { space: SpaceSummary }) {
  const counts = spaceCounts(space);
  return (
    <Link
      to="/spaces/$name"
      params={{ name: space.name }}
      className="flex flex-col gap-xs px-m py-s outline-none transition-colors in-[li:not(:first-child)]:edge-top in-[li:not(:first-child)]:edge-neutral-4 hover:bg-neutral-3 focus-visible:focus-ring focus-visible:-outline-offset-2"
    >
      <span className="flex min-w-0 flex-wrap items-center gap-xs">
        <span className="font-ui text-m font-medium text-neutral-10">{space.name}</span>
        <SpaceRoleBadges space={space} />
      </span>
      <span className="flex flex-col gap-xxs">
        <span className="font-data text-s text-neutral-7">{spaceFolders(space).join(" · ")}</span>
        <span className="font-ui text-s text-neutral-7">
          {counts.length > 0 ? counts.join(" · ") : m.space_nothing_yet()}
        </span>
      </span>
    </Link>
  );
}

export function SpaceListSkeleton() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true">
      <div className="flex flex-col gap-xs">
        <Skeleton className="h-(--line-l) w-32" />
        <Skeleton className="h-(--line-s) w-20" />
      </div>
      <div className="flex flex-col gap-s">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
    </div>
  );
}
