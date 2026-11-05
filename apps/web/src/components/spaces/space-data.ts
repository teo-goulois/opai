import type { RuleSummary } from "@opai/context/rules";
import type { SpaceConfig } from "@opai/context/space-view";
import type { QueryClient } from "@tanstack/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";

import type { SkillRow } from "@/components/skills/skill-list";
import { orpc } from "@/utils/orpc";

import { orderSpaces } from "./space-ui";

export const spaceQuery = (name: string) => orpc.spaces.get.queryOptions({ input: { name } });
export const spacesQuery = orpc.spaces.list.queryOptions();
export const rulesQuery = orpc.rules.list.queryOptions();
export const skillsQuery = orpc.skills.list.queryOptions();

/** What every page of a space reads; the layout route loads it first. */
export function loadSpaceData(queryClient: QueryClient, name: string) {
  return Promise.all([
    queryClient.ensureQueryData(spaceQuery(name)),
    queryClient.ensureQueryData(spacesQuery),
    queryClient.ensureQueryData(rulesQuery),
    queryClient.ensureQueryData(skillsQuery),
  ]);
}

/** A module is an optional rule of the base space: spaces/global/modules/<name>.md. */
export function moduleName(rule: RuleSummary) {
  const match = /\/modules\/([^/]+)\.md$/.exec(rule.path);
  return match?.[1];
}

export type EffectiveRule = RuleSummary & {
  /** Comes from the base space. */
  inherited: boolean;
  /** The module's name, when the rule is a module of the base space. */
  module?: string;
  /** False for a module turned off in this space. */
  enabled: boolean;
};

/** The rules a session in `space` gets: the base ones first, then its own. */
export function effectiveRules(
  space: SpaceConfig,
  spaces: SpaceConfig[],
  rules: RuleSummary[],
): EffectiveRule[] {
  const base = spaces.find((item) => item.base)?.name;
  const of = (name: string | undefined, inherited: boolean) =>
    rules
      .filter((rule) => rule.space !== undefined && rule.space === name)
      .map((rule): EffectiveRule => {
        const module = name === base ? moduleName(rule) : undefined;
        return {
          ...rule,
          inherited,
          ...(module ? { module } : {}),
          enabled: !module || !space.disable.includes(module),
        };
      });
  if (space.base) return of(space.name, false);
  return [...of(base, true), ...of(space.name, false)];
}

/** The skills a session in `space` gets: the base ones, then its own. */
export function effectiveSkills(space: SpaceConfig, spaces: SpaceConfig[], skills: SkillRow[]) {
  const base = spaces.find((item) => item.base)?.name;
  return skills
    .filter((skill) => skill.space === space.name || (!space.base && skill.space === base))
    .map((skill) => ({ ...skill, inherited: skill.space !== space.name }));
}

/** Every page of a space reads these, already in the cache. */
export function useSpaceData(name: string) {
  const { data: space } = useSuspenseQuery(spaceQuery(name));
  const { data: summaries } = useSuspenseQuery(spacesQuery);
  const { data: rules } = useSuspenseQuery(rulesQuery);
  const { data: skillData } = useSuspenseQuery(skillsQuery);
  const spaces = orderSpaces(summaries);
  return {
    space,
    spaces,
    spaceIndex: Math.max(
      0,
      spaces.findIndex((item) => item.name === name),
    ),
    rules,
    skills: skillData.skills,
    ownSkills: skillData.skills.filter((skill) => skill.space === name),
    since: skillData.since,
    problems: skillData.problems,
  };
}
