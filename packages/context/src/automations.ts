// What runs on this machine, next to what the registry says runs. The
// registry is `context/ops.md` of a space, written by hand: the only place
// that knows the automations Opai cannot read (another machine, a manager
// such as Grok Bot). Opai reads two sources on this machine:
//
// - Codex app automations: `automations/<id>/automation.toml` of the default
//   Codex folder (~/.codex) and of the instance's codex/;
// - launchd agents: ~/Library/LaunchAgents/*.plist, with `launchctl list`
//   for whether each one runs (macOS only).
//
// An automation counts as documented when its id or label appears in a
// registry. Nothing here runs or changes an automation.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import { Data, Effect } from "effect";
import { parse as parseToml } from "smol-toml";

import { hashText, readText, StaleWrite, writeText } from "./files.ts";
import { outline, type Heading } from "./markdown/document.ts";
import { homePath, loadSpaces } from "./spaces.ts";

export type CodexAutomation = {
  id: string;
  name: string;
  /** "heartbeat" posts in a chat, "cron" starts a run in a project. */
  kind: string;
  status: "active" | "paused";
  /** The RRULE, without DTSTART. */
  schedule: string;
  /** Its UNTIL is in the past: it no longer fires. */
  ended: boolean;
  /** The first line of the prompt. */
  summary: string;
  /** Where the file is, from ~. */
  path: string;
  documented: boolean;
};

export type LaunchSchedule = {
  /** StartInterval, in seconds. */
  everySeconds?: number;
  /** StartCalendarInterval entries; a missing field means every one. */
  calendar?: { weekday?: number; hour?: number; minute?: number }[];
  atLoad: boolean;
  keepAlive: boolean;
};

export type LaunchAgent = {
  label: string;
  /** The program and its arguments, `NAME=value` pairs shortened to `NAME=…`. */
  command: string;
  schedule: LaunchSchedule;
  /** From `launchctl list`: running with a PID, last exit code, or not loaded. */
  state: { loaded: false } | { loaded: true; pid?: number; lastExit?: number };
  /** Installed by an app (no program of its own, or one under an app's folders), not yours. */
  fromApp: boolean;
  path: string;
  documented: boolean;
};

export type Registry = {
  space: string;
  /** Relative to the instance. */
  path: string;
};

export type Automations = {
  registries: Registry[];
  codex: CodexAutomation[];
  /** Null off macOS. */
  launchd: LaunchAgent[] | null;
};

export type RegistryFile = Registry & { markdown: string; hash: string; sections: Heading[] };

export class RegistryNotFound extends Data.TaggedError("RegistryNotFound")<{ space: string }> {}

const REGISTRY = ["context", "ops.md"];

/** Every space's context/ops.md that exists. */
export function listRegistries(root: string): Registry[] {
  return loadSpaces(root).flatMap((space) => {
    const path = join("spaces", space.name, ...REGISTRY);
    return existsSync(join(root, path)) ? [{ space: space.name, path }] : [];
  });
}

function registryText(root: string) {
  return listRegistries(root)
    .map((registry) => readFileSync(join(root, registry.path), "utf8"))
    .join("\n");
}

function folders(path: string) {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** The RRULE of a schedule, and whether its UNTIL has passed. */
function rrule(value: string, now: Date) {
  const rule =
    value
      .split(/\r?\n/)
      .find((line) => !line.startsWith("DTSTART"))
      ?.replace(/^RRULE:/, "") ?? value;
  const until = /UNTIL=(\d{8}T\d{6}Z?)/.exec(rule)?.[1];
  const end = until
    ? Date.parse(
        until.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/, "$1-$2-$3T$4:$5:$6Z"),
      )
    : NaN;
  return { schedule: rule, ended: Number.isFinite(end) && end < now.getTime() };
}

/** The Codex app automations of every folder given. */
export function readCodexAutomations(codexHomes: string[], documented: string, now = new Date()) {
  const seen = new Set<string>();
  return codexHomes.flatMap((home) =>
    folders(join(home, "automations")).flatMap((folder): CodexAutomation[] => {
      const file = join(home, "automations", folder, "automation.toml");
      if (!existsSync(file) || seen.has(file)) return [];
      seen.add(file);
      let data: Record<string, unknown>;
      try {
        data = parseToml(readFileSync(file, "utf8")) as Record<string, unknown>;
      } catch {
        return [];
      }
      const id = typeof data.id === "string" ? data.id : folder;
      const name = typeof data.name === "string" ? data.name : id;
      const prompt = typeof data.prompt === "string" ? data.prompt : "";
      const { schedule, ended } = rrule(typeof data.rrule === "string" ? data.rrule : "", now);
      return [
        {
          id,
          name,
          kind: typeof data.kind === "string" ? data.kind : "",
          status: String(data.status).toUpperCase() === "PAUSED" ? "paused" : "active",
          schedule,
          ended,
          summary: prompt.trim().split("\n")[0]?.slice(0, 240) ?? "",
          path: homePath(file),
          documented: documented.includes(id) || documented.includes(name),
        },
      ];
    }),
  );
}

type Plist = Record<string, unknown>;

/** A plist as JSON, through plutil. */
function readPlist(file: string): Plist | undefined {
  try {
    return JSON.parse(
      execFileSync("plutil", ["-convert", "json", "-o", "-", file], { encoding: "utf8" }),
    ) as Plist;
  } catch {
    return undefined;
  }
}

function programArguments(plist: Plist) {
  const args = Array.isArray(plist.ProgramArguments)
    ? plist.ProgramArguments.filter((arg): arg is string => typeof arg === "string")
    : [];
  return typeof plist.Program === "string" ? [plist.Program, ...args.slice(1)] : args;
}

/** The program an agent runs: past `env` and its options and assignments. */
function program(args: string[]) {
  const start = basename(args[0] ?? "") === "env" ? 1 : 0;
  return args.slice(start).find((arg) => !arg.startsWith("-") && !/^[A-Z_][A-Z0-9_]*=/.test(arg));
}

/** An agent an app installed: no program of its own, or one in an app's folders. */
function fromApp(path: string | undefined) {
  if (!path) return true;
  const library = join(homedir(), "Library") + "/";
  return (
    /^\/(Applications|Library|System)\//.test(path) ||
    path.startsWith(library) ||
    path.includes(".app/")
  );
}

/** Arguments with the values of `NAME=value` pairs hidden: they can hold secrets. */
function command(args: string[]) {
  return args
    .map((arg) => (/^[A-Z_][A-Z0-9_]*=/.test(arg) ? `${arg.split("=")[0]}=…` : homePath(arg)))
    .join(" ");
}

function schedule(plist: Plist): LaunchSchedule {
  const intervals = plist.StartCalendarInterval;
  const calendar = (Array.isArray(intervals) ? intervals : intervals ? [intervals] : []).map(
    (entry) => {
      const value = entry as Record<string, unknown>;
      const number = (key: string) => (typeof value[key] === "number" ? value[key] : undefined);
      const weekday = number("Weekday");
      const hour = number("Hour");
      const minute = number("Minute");
      return {
        ...(weekday !== undefined ? { weekday } : {}),
        ...(hour !== undefined ? { hour } : {}),
        ...(minute !== undefined ? { minute } : {}),
      };
    },
  );
  return {
    ...(typeof plist.StartInterval === "number" ? { everySeconds: plist.StartInterval } : {}),
    ...(calendar.length > 0 ? { calendar } : {}),
    atLoad: plist.RunAtLoad === true,
    keepAlive: plist.KeepAlive !== undefined && plist.KeepAlive !== false,
  };
}

/** `launchctl list`: label → PID and last exit code. */
export function parseLaunchctlList(output: string) {
  const states = new Map<string, { pid?: number; lastExit?: number }>();
  for (const line of output.split("\n").slice(1)) {
    const [pid, status, label] = line.split("\t");
    if (!label) continue;
    states.set(label, {
      ...(pid && pid !== "-" ? { pid: Number(pid) } : {}),
      ...(status && status !== "-" ? { lastExit: Number(status) } : {}),
    });
  }
  return states;
}

/** The launchd agents of a folder, with their state. */
export function readLaunchAgents(folder: string, launchctl: string, documented: string) {
  const states = parseLaunchctlList(launchctl);
  let files: string[];
  try {
    files = readdirSync(folder).filter((file) => file.endsWith(".plist"));
  } catch {
    return [];
  }
  return files.sort().flatMap((file): LaunchAgent[] => {
    const plist = readPlist(join(folder, file));
    if (!plist) return [];
    const label = typeof plist.Label === "string" ? plist.Label : basename(file, ".plist");
    const state = states.get(label);
    const args = programArguments(plist);
    return [
      {
        label,
        command: command(args),
        schedule: schedule(plist),
        state: state ? { loaded: true, ...state } : { loaded: false },
        fromApp: fromApp(program(args)),
        path: homePath(join(folder, file)),
        documented: documented.includes(label),
      },
    ];
  });
}

function launchctlList() {
  try {
    return execFileSync("launchctl", ["list"], { encoding: "utf8", timeout: 5_000 });
  } catch {
    return "";
  }
}

/** Everything the Automations page shows. */
export const getAutomations = (root: string) =>
  Effect.sync((): Automations => {
    const documented = registryText(root);
    const home = homedir();
    return {
      registries: listRegistries(root),
      codex: readCodexAutomations([join(home, ".codex"), join(root, "codex")], documented),
      launchd:
        process.platform === "darwin"
          ? readLaunchAgents(join(home, "Library", "LaunchAgents"), launchctlList(), documented)
          : null,
    };
  });

const findRegistry = (root: string, space: string) =>
  Effect.gen(function* () {
    const registry = listRegistries(root).find((candidate) => candidate.space === space);
    if (!registry) return yield* Effect.fail(new RegistryNotFound({ space }));
    return registry;
  });

export const getRegistry = (root: string, space: string) =>
  Effect.gen(function* () {
    const registry = yield* findRegistry(root, space);
    const markdown = yield* readText(join(root, registry.path));
    const file: RegistryFile = {
      ...registry,
      markdown,
      hash: hashText(markdown),
      sections: outline(markdown).filter((heading) => heading.depth <= 3),
    };
    return file;
  });

/** Replaces a registry, if nobody changed it since `baseHash`. */
export const updateRegistry = (root: string, space: string, markdown: string, baseHash: string) =>
  Effect.gen(function* () {
    const registry = yield* findRegistry(root, space);
    const path = join(root, registry.path);
    if (hashText(yield* readText(path)) !== baseHash) {
      return yield* new StaleWrite({ path: registry.path });
    }
    yield* writeText(path, markdown);
    return yield* getRegistry(root, space);
  });
