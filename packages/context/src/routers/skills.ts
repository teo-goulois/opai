// The procedures behind the app's Skills page. They change the user's own skills
// and fetch from the network, so mcp.ts never offers them to agents.

import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import { z } from "zod";

import { o } from "../procedure.ts";
import {
  addSkill,
  checkSkills,
  listSkills,
  moveSkill,
  saveSkill,
  SkillError,
  skillDetail,
  updateSkill,
  type Skill,
} from "../skills.ts";
import { loadSpaces } from "../spaces.ts";
import { countSkillUses, firstObservedUse, type SkillCount } from "../usage.ts";

const Name = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "A skill name")
  .max(64);
const Space = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "A space name");

async function run<A>(work: () => A | Promise<A>) {
  try {
    return await work();
  } catch (error) {
    if (!(error instanceof SkillError)) throw error;
    const code = error.message.startsWith("No skill named")
      ? "NOT_FOUND"
      : /changed on disk|already exists/.test(error.message)
        ? "CONFLICT"
        : "BAD_REQUEST";
    throw new ORPCError(code, { message: error.message });
  }
}

export type SkillUsage = { uses: number; byUser: number; lastUsed: string | undefined };

/** A skill's uses: Claude names a space's skills <space>:<name>, Codex <name>. */
function usageOf(skill: Skill, counts: SkillCount[]): SkillUsage {
  const ids = new Set([skill.name, `${skill.space}:${skill.name}`]);
  const mine = counts.filter((count) => ids.has(count.skill));
  return {
    uses: mine.reduce((sum, count) => sum + count.uses, 0),
    byUser: mine.reduce((sum, count) => sum + count.byUser, 0),
    lastUsed: mine
      .map((count) => count.lastUsed)
      .sort()
      .at(-1),
  };
}

export const skillsRouter = {
  list: o.handler(async ({ context }) => {
    const [counts, since] = await Promise.all([
      Effect.runPromise(countSkillUses(context.root)),
      Effect.runPromise(firstObservedUse(context.root)),
    ]);
    return {
      skills: listSkills(context.root).map((skill) => ({
        ...skill,
        usage: usageOf(skill, counts),
      })),
      spaces: loadSpaces(context.root).map((space) => ({ name: space.name, base: space.base })),
      since,
      problems: checkSkills(context.root),
    };
  }),
  get: o.input(z.object({ name: Name })).handler(async ({ context, input }) => {
    const counts = await Effect.runPromise(countSkillUses(context.root));
    return run(() => {
      const skill = skillDetail(context.root, input.name);
      return { ...skill, usage: usageOf(skill, counts) };
    });
  }),
  save: o
    .input(z.object({ name: Name, markdown: z.string().max(500_000), baseHash: z.string().min(1) }))
    .handler(({ context, input }) =>
      run(() => saveSkill(context.root, input.name, input.markdown, input.baseHash)),
    ),
  add: o
    .input(
      z.object({
        source: z.string().min(1).max(2000),
        space: Space.optional(),
        name: Name.optional(),
      }),
    )
    .handler(({ context, input }) => run(() => addSkill(context.root, input.source, input))),
  move: o
    .input(z.object({ name: Name, space: Space }))
    .handler(({ context, input }) => run(() => moveSkill(context.root, input.name, input.space))),
  /** Compares with the source; with apply, takes upstream when our copy has no local change. */
  compare: o
    .input(z.object({ name: Name, apply: z.boolean().optional() }))
    .handler(({ context, input }) =>
      run(() => updateSkill(context.root, input.name, { apply: input.apply })),
    ),
};
