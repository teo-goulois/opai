// Skill uses, kept in Git. The sessions of Claude Code and Codex stay on the
// machine and Claude deletes its own after 30 days, so `collect` copies each
// skill use found in them into spaces/<space>/agents/usage/<machine>.jsonl,
// one JSON line per use, in the space of the session's folder. sync.sh runs
// it before each commit, and the app counts the uses of every machine.
//
//   node usage.ts collect    add this machine's new skill uses

import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { Data, Effect } from "effect";

import { author } from "./records.ts";
import { readSession, sessionFiles, type SkillUse } from "./sessions.ts";
import { homePath, loadSpaces, ROOT, spaceFolders, which } from "./spaces.ts";

export class UsageUnreadable extends Data.TaggedError("UsageUnreadable")<{
  path: string;
  cause: unknown;
}> {}

/** One line of a usage file. */
export type UsageRecord = Omit<SkillUse, "cwd"> & {
  machine: string;
  space: string;
  /** The session's folder, as ~/… */
  cwd?: string | undefined;
};

export type SkillCount = {
  skill: string;
  uses: number;
  /** Uses I asked for, with /skill or $skill. */
  byUser: number;
  lastUsed: string;
  agents: string[];
  machines: string[];
  spaces: string[];
};

function usageFile(root: string, space: string, machine: string) {
  return join(spaceFolders(root, space).agents, "usage", `${machine}.jsonl`);
}

async function readLines(path: string): Promise<UsageRecord[]> {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return [];
  }
  return text
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as UsageRecord];
      } catch {
        return [];
      }
    });
}

/** Every usage file of every space and machine. */
async function usagePaths(root: string) {
  const paths = await Promise.all(
    loadSpaces(root).map(async (space) => {
      const folder = join(spaceFolders(root, space.name).agents, "usage");
      try {
        return (await readdir(folder))
          .filter((name) => name.endsWith(".jsonl"))
          .map((name) => join(folder, name));
      } catch {
        return [];
      }
    }),
  );
  return paths.flat();
}

/** When collect last ran on this machine, kept out of Git in .local/. */
function stampFile(root: string) {
  return join(root, ".local", "usage-collected");
}

/**
 * Adds this machine's skill uses not recorded yet, and drops the recorded
 * ones a session it reads again no longer shows (the rules of a use got
 * stricter). It reads only the sessions changed since its last run.
 */
export async function collect(root: string) {
  const { machine } = author(undefined);
  const started = Date.now();
  const since = Number(await readFile(stampFile(root), "utf8").catch(() => "0")) || 0;
  const spaces = loadSpaces(root);
  const known = new Set<string>();
  for (const path of await usagePaths(root)) {
    for (const record of await readLines(path)) known.add(record.id);
  }

  const fresh = new Map<string, UsageRecord[]>();
  // The uses of each session read again in this run.
  const reread = new Map<string, Set<string>>();
  for (const file of await sessionFiles(root)) {
    // A minute of margin for a session written while the last run read it.
    if (file.mtime < since - 60_000) continue;
    const session = await readSession(root, file);
    reread.set(session.id, new Set(session.uses.map((use) => use.id)));
    for (const use of session.uses) {
      if (known.has(use.id) || !use.ts) continue;
      known.add(use.id);
      const space = (use.cwd && which(root, use.cwd, spaces)?.space.name) || "perso";
      const record: UsageRecord = {
        ...use,
        machine,
        space,
        cwd: use.cwd ? homePath(use.cwd) : undefined,
      };
      fresh.set(space, [...(fresh.get(space) ?? []), record]);
    }
  }

  let removed = 0;
  for (const path of await usagePaths(root)) {
    if (!path.endsWith(`${machine}.jsonl`)) continue;
    const records = await readLines(path);
    const kept = records.filter(
      (record) => !reread.has(record.session) || reread.get(record.session)!.has(record.id),
    );
    if (kept.length === records.length) continue;
    removed += records.length - kept.length;
    await writeFile(path, kept.map((record) => JSON.stringify(record) + "\n").join(""));
  }

  let added = 0;
  for (const [space, records] of fresh) {
    const path = usageFile(root, space, machine);
    records.sort((a, b) => a.ts.localeCompare(b.ts));
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, records.map((record) => JSON.stringify(record) + "\n").join(""));
    added += records.length;
  }
  await mkdir(dirname(stampFile(root)), { recursive: true });
  await writeFile(stampFile(root), String(started));
  return { added, removed };
}

/** Uses per skill, most used first, across every machine and space. */
export const countSkillUses = (root: string) =>
  Effect.tryPromise({
    try: async () => {
      const counts = new Map<string, SkillCount>();
      for (const path of await usagePaths(root)) {
        for (const record of await readLines(path)) {
          const count = counts.get(record.skill) ?? {
            skill: record.skill,
            uses: 0,
            byUser: 0,
            lastUsed: "",
            agents: [],
            machines: [],
            spaces: [],
          };
          count.uses += 1;
          if (record.trigger === "user") count.byUser += 1;
          if (record.ts > count.lastUsed) count.lastUsed = record.ts;
          for (const [list, value] of [
            [count.agents, record.agent],
            [count.machines, record.machine],
            [count.spaces, record.space],
          ] as const) {
            if (value && !list.includes(value)) list.push(value);
          }
          counts.set(record.skill, count);
        }
      }
      return [...counts.values()].sort(
        (a, b) => b.uses - a.uses || b.lastUsed.localeCompare(a.lastUsed),
      );
    },
    catch: (cause) => new UsageUnreadable({ path: root, cause }),
  });

/** Uses per machine, then per skill id as recorded. */
export const usesByMachine = (root: string) =>
  Effect.tryPromise({
    try: async () => {
      const machines = new Map<string, Map<string, number>>();
      for (const path of await usagePaths(root)) {
        for (const record of await readLines(path)) {
          if (!record.machine) continue;
          const skills = machines.get(record.machine) ?? new Map<string, number>();
          skills.set(record.skill, (skills.get(record.skill) ?? 0) + 1);
          machines.set(record.machine, skills);
        }
      }
      return machines;
    },
    catch: (cause) => new UsageUnreadable({ path: root, cause }),
  });

/** When the oldest recorded use happened: uses are only observed since then. */
export const firstObservedUse = (root: string) =>
  Effect.tryPromise({
    try: async () => {
      let first: string | undefined;
      for (const path of await usagePaths(root)) {
        for (const record of await readLines(path)) {
          if (record.ts && (!first || record.ts < first)) first = record.ts;
        }
      }
      return first;
    },
    catch: (cause) => new UsageUnreadable({ path: root, cause }),
  });

if (import.meta.main) {
  const [command] = process.argv.slice(2);
  if (command === "collect") {
    const { added, removed } = await collect(ROOT);
    console.log(`Recorded ${added} new skill uses, dropped ${removed}.`);
  } else {
    console.error("usage: node usage.ts collect");
    process.exitCode = 1;
  }
}
