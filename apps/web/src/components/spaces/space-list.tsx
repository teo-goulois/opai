import type { SpaceSummary } from "@opai/context/space-view";
import {
  ItemDescription,
  ItemEnd,
  ItemList,
  ItemMain,
  ItemRow,
  ItemTitle,
} from "@opai/ui/components/ui/item-list";
import { PageDescription, PageHeader, PageTitle } from "@opai/ui/components/ui/page-header";
import { Skeleton } from "@opai/ui/components/ui/skeleton";
import { Link } from "@tanstack/react-router";

import { m } from "@/paraglide/messages.js";

import { NewSpaceDialog } from "./space-settings";
import { orderSpaces, SpaceDot, SpaceRoleBadge, spaceFolders } from "./space-ui";

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
        <div className="flex flex-wrap items-center justify-between gap-s">
          <PageTitle>{m.spaces_title()}</PageTitle>
          <NewSpaceDialog />
        </div>
        <PageDescription className="text-pretty">{m.spaces_description()}</PageDescription>
      </PageHeader>

      <ItemList className="gap-xs">
        {orderSpaces(spaces).map((space, index) => {
          const counts = spaceCounts(space);
          return (
            <li key={space.name}>
              <ItemRow
                className="items-start py-s"
                render={<Link to="/spaces/$name" params={{ name: space.name }} />}
              >
                <span className="flex h-(--line-m) items-center" aria-hidden>
                  <SpaceDot index={index} />
                </span>
                <ItemMain>
                  <ItemTitle>
                    {space.name}
                    <SpaceRoleBadge space={space} />
                  </ItemTitle>
                  {space.description ? (
                    <ItemDescription>{space.description}</ItemDescription>
                  ) : null}
                  <ItemDescription className="text-neutral-6">
                    {spaceFolders(space).join(" · ")}
                  </ItemDescription>
                </ItemMain>
                <ItemEnd className="hidden pt-xxs sm:flex">
                  {counts.length > 0 ? counts.join(" · ") : m.space_nothing_yet()}
                </ItemEnd>
              </ItemRow>
            </li>
          );
        })}
      </ItemList>
    </div>
  );
}

export function SpaceListSkeleton() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true">
      <Skeleton className="h-(--line-l) w-32" />
      <div className="flex flex-col gap-s">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
