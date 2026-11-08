// The machines that share the instance, as its Git repository shows them.
//
// Each machine's sync publishes its state in
// spaces/<base>/agents/machines/<machine>.json: the skills it has not shared
// (sharing.ts). The file changes only when that state does, so it adds no
// commit to a sync that changes nothing. What it has not shared, the other
// machines cannot see in their own files: this is how they learn it.
//
//   node machines.ts report    write this machine's state, if it changed

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { Effect } from "effect";

import { readMachines } from "./automations.ts";
import { author } from "./records.ts";
import { skillSharing, type Sharing } from "./sharing.ts";
import { listSkills } from "./skills.ts";
import { loadSpaces, ROOT, spaceFolders } from "./spaces.ts";
import { usesByMachine } from "./usage.ts";

/** What a machine has not shared: the skills committed nowhere, or changed since. */
export type Unshared = Exclude<Sharing, "pending" | "shared">;

export type MachineState = {
  machine: string;
  /** By skill name. */
  skills: Record<string, Unshared>;
};

export type Machine = {
  name: string;
  /** The machine this app runs on. */
  current: boolean;
  /** Named in machines.json, for the Automations page. */
  declared: boolean;
  /** When its sync last committed what its agents wrote. */
  lastActivity: string | undefined;
  /** Its unshared skills; undefined until its sync publishes its state. */
  unshared: Record<string, Unshared> | undefined;
  uses: number;
  /** Its most used skills, most used first. */
  skills: { skill: string; uses: number }[];
};

export function thisMachine() {
  return author(undefined).machine;
}

function stateFolder(root: string) {
  const base = loadSpaces(root).find((space) => space.base)?.name ?? "global";
  return join(spaceFolders(root, base).agents, "machines");
}

/** This machine's state now; undefined when the instance has nothing to share through. */
export function currentState(root: string, machine = thisMachine()): MachineState | undefined {
  const skills = listSkills(root);
  const sharing = skillSharing(root, skills);
  if (!sharing) return undefined;
  const unshared: Record<string, Unshared> = {};
  for (const skill of skills) {
    const state = sharing.get(skill.folder);
    if (state === "local" || state === "changed") unshared[skill.name] = state;
  }
  return { machine, skills: unshared };
}

const text = (state: MachineState) => `${JSON.stringify(state, null, 2)}\n`;

/** Writes this machine's state when it differs from the file. Returns whether it wrote. */
export function reportState(root: string, machine = thisMachine()) {
  const state = currentState(root, machine);
  if (!state) return false;
  const folder = stateFolder(root);
  const file = join(folder, `${machine}.json`);
  let before = "";
  try {
    before = readFileSync(file, "utf8");
  } catch {
    // Its first report.
  }
  if (before === text(state)) return false;
  mkdirSync(folder, { recursive: true });
  writeFileSync(file, text(state));
  return true;
}

/** The states the machines published, by machine. */
export function readStates(root: string) {
  const states = new Map<string, MachineState>();
  let names: string[] = [];
  try {
    names = readdirSync(stateFolder(root)).filter((name) => name.endsWith(".json"));
  } catch {
    return states;
  }
  for (const name of names) {
    try {
      const state = JSON.parse(readFileSync(join(stateFolder(root), name), "utf8")) as MachineState;
      if (typeof state.machine === "string" && state.skills && typeof state.skills === "object") {
        states.set(state.machine, state);
      }
    } catch {
      // A file cut by a conflict: the next report rewrites it.
    }
  }
  return states;
}

/** The names in machines.json; none when it is missing or invalid. */
function declaredMachines(root: string) {
  try {
    return readMachines(root).map((machine) => machine.name);
  } catch {
    return [];
  }
}

/** When each machine's sync last committed, from the subjects sync.sh writes. */
function lastActivity(root: string) {
  const last = new Map<string, string>();
  let out = "";
  try {
    out = execFileSync(
      "git",
      ["-C", root, "log", "-n", "5000", "--format=%cI%x09%s", "-E", "--grep=^Agents on [^:]+:"],
      { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch {
    return last;
  }
  for (const line of out.split("\n")) {
    const match = /^(\S+)\tAgents on ([^:]+):/.exec(line);
    if (match && !last.has(match[2]!)) last.set(match[2]!, match[1]!);
  }
  return last;
}

/** Every machine the instance knows: this one first, then by name. */
export async function listMachines(root: string): Promise<Machine[]> {
  const current = thisMachine();
  const spaces = new Set(loadSpaces(root).map((space) => space.name));
  const uses = await Effect.runPromise(usesByMachine(root));
  const states = readStates(root);
  const activity = lastActivity(root);
  const declared = new Set(declaredMachines(root));
  const names = new Set([
    current,
    ...declared,
    ...states.keys(),
    ...uses.keys(),
    ...activity.keys(),
  ]);
  const live = currentState(root, current);

  return [...names]
    .map((name) => {
      // Claude names a space's skills <space>:<name>; count them under <name>.
      const counts = new Map<string, number>();
      for (const [skill, count] of uses.get(name) ?? []) {
        const [prefix, rest] = skill.split(":", 2);
        const id = rest && prefix && spaces.has(prefix) ? rest : skill;
        counts.set(id, (counts.get(id) ?? 0) + count);
      }
      const skills = [...counts]
        .map(([skill, count]) => ({ skill, uses: count }))
        .sort((a, b) => b.uses - a.uses || a.skill.localeCompare(b.skill));
      return {
        name,
        current: name === current,
        declared: declared.has(name),
        lastActivity: activity.get(name),
        unshared: name === current ? live?.skills : states.get(name)?.skills,
        uses: skills.reduce((sum, item) => sum + item.uses, 0),
        skills: skills.slice(0, 8),
      };
    })
    .sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name));
}

if (import.meta.main) {
  const [command] = process.argv.slice(2);
  if (command === "report") {
    console.log(reportState(ROOT) ? "Wrote this machine's state." : "State unchanged.");
  } else {
    console.error("usage: node machines.ts report");
    process.exitCode = 1;
  }
}
