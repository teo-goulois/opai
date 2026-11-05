import { Badge } from "@opai/ui/components/ui/badge";
import {
  ItemDescription,
  ItemEnd,
  ItemList,
  ItemMain,
  ItemRow,
  ItemTitle,
} from "@opai/ui/components/ui/item-list";
import { PageSection, PageSectionTitle } from "@opai/ui/components/ui/page-header";
import { Skeleton } from "@opai/ui/components/ui/skeleton";
import { Link } from "@tanstack/react-router";

import { approxTokens } from "@/components/sessions/session-list";
import { skillChars, SkillTrigger } from "@/components/skills/skill-list";
import { m } from "@/paraglide/messages.js";
import { formatRelative } from "@/utils/format";

import { effectiveRules, effectiveSkills, useSpaceData } from "./space-data";
import { Hint, SpaceHeader, spaceFolders } from "./space-ui";

/** What a session in this space gets, and what agents did here lately. */
export function SpaceOverview({ name }: { name: string }) {
  const { space, spaces, rules, skills, ownSkills } = useSpaceData(name);
  const base = spaces.find((item) => item.base)?.name;
  const ruleRows = effectiveRules(space, spaces, rules).filter((rule) => rule.enabled);
  const skillRows = effectiveSkills(space, spaces, skills);
  const automatic = skillRows.filter((skill) => !skill.explicitOnly);
  const tokens = approxTokens(automatic.reduce((sum, skill) => sum + skillChars(skill), 0));
  const recent = space.journal.slice(0, 3);

  return (
    <div className="flex flex-col gap-xl">
      <SpaceHeader space={space} skills={ownSkills.length} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-xl lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="flex min-w-0 flex-col gap-xl">
          <PageSection aria-labelledby="overview-rules">
            <div className="flex flex-col gap-xxs">
              <PageSectionTitle id="overview-rules" count={ruleRows.length}>
                {m.space_overview_rules()}
              </PageSectionTitle>
              <Hint>
                {space.base ? m.space_overview_rules_base() : m.space_overview_rules_hint()}
              </Hint>
            </div>
            {ruleRows.length > 0 ? (
              <ItemList>
                {ruleRows.map((rule) => (
                  <li key={rule.id}>
                    <ItemRow
                      render={
                        <Link
                          to="/spaces/$name/rules/$id"
                          params={{ name: rule.space ?? name, id: rule.id }}
                        />
                      }
                    >
                      <ItemMain>
                        <ItemTitle>{rule.title}</ItemTitle>
                        {rule.summary ? <ItemDescription>{rule.summary}</ItemDescription> : null}
                      </ItemMain>
                      <ItemEnd>
                        {rule.module ? <Badge variant="neutral">{m.rule_module()}</Badge> : null}
                        {rule.inherited && base ? <span>{base}</span> : null}
                      </ItemEnd>
                    </ItemRow>
                  </li>
                ))}
              </ItemList>
            ) : (
              <Hint>{m.space_rules_none({ path: `spaces/${space.name}/AGENTS.md` })}</Hint>
            )}
          </PageSection>

          <PageSection aria-labelledby="overview-skills">
            <div className="flex flex-col gap-xxs">
              <PageSectionTitle id="overview-skills" count={skillRows.length}>
                {m.nav_skills()}
              </PageSectionTitle>
              <Hint>
                {m.space_overview_skills({
                  automatic: automatic.length,
                  manual: skillRows.length - automatic.length,
                  tokens,
                })}
              </Hint>
            </div>
            {skillRows.length > 0 ? (
              <ul className="flex flex-wrap gap-xs">
                {skillRows.map((skill) => (
                  <li key={skill.name}>
                    <Link
                      to="/spaces/$name/skills/$skill"
                      params={{ name: skill.space, skill: skill.name }}
                      className="inline-flex items-center gap-xs rounded-s bg-neutral-3 px-s py-xxs font-ui text-s text-neutral-10 outline-none transition-colors hover:bg-neutral-4 focus-visible:focus-ring"
                    >
                      {skill.name}
                      {skill.explicitOnly ? <SkillTrigger skill={skill} compact /> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Hint>{m.skills_space_none()}</Hint>
            )}
          </PageSection>

          {recent.length > 0 ? (
            <PageSection aria-labelledby="overview-journal">
              <div className="flex items-baseline justify-between gap-s">
                <PageSectionTitle id="overview-journal">{m.space_recent()}</PageSectionTitle>
                <Link
                  to="/spaces/$name/journal"
                  params={{ name }}
                  className="rounded-xs font-ui text-s text-neutral-7 transition-colors hover:text-neutral-10 focus-visible:focus-ring"
                >
                  {m.space_journal_all()}
                </Link>
              </div>
              <ItemList>
                {recent.map((entry) => (
                  <li key={entry.path}>
                    <ItemRow>
                      <ItemMain>
                        <ItemTitle>{entry.title}</ItemTitle>
                        <ItemDescription>{entry.project}</ItemDescription>
                      </ItemMain>
                      <ItemEnd>{entry.date ? formatRelative(entry.date) : null}</ItemEnd>
                    </ItemRow>
                  </li>
                ))}
              </ItemList>
            </PageSection>
          ) : null}
        </div>

        <aside className="flex flex-col gap-l lg:sticky lg:top-xl lg:self-start">
          <PageSection>
            <PageSectionTitle>{m.space_folders()}</PageSectionTitle>
            {!space.base && !space.default && space.paths.length === 0 ? (
              <Hint>{m.space_folders_none()}</Hint>
            ) : (
              <ul className="flex flex-col gap-xxs font-ui text-s text-neutral-8">
                {spaceFolders(space).map((folder) => (
                  <li key={folder} className="break-all">
                    {folder}
                  </li>
                ))}
              </ul>
            )}
          </PageSection>
        </aside>
      </div>
    </div>
  );
}

export function SpacePageSkeleton() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true">
      <div className="flex flex-col gap-xs">
        <Skeleton className="h-(--line-l) w-40" />
        <Skeleton className="h-(--line-m) w-80" />
      </div>
      <Skeleton className="h-(--line-m) w-full" />
      <div className="flex flex-col gap-s">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
