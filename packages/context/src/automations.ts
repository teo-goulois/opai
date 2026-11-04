// What runs on each machine, next to what the registry says runs. The
// registry is `context/ops.md` of a space, written by hand: the only place
// that knows the automations Opai cannot read (a manager such as Grok Bot,
// T3 Code's scheduled tasks). Opai reads two sources on a machine:
//
// - Codex app automations: `automations/<id>/automation.toml` of the Codex
//   folder (~/.codex, and on this machine the instance's codex/ too);
// - launchd agents: ~/Library/LaunchAgents/*.plist, with `launchctl list`
//   for whether each one runs (macOS only).
//
// This machine is read directly; the machines of `machines.json` at the root
// of the instance through SSH, read-only. An automation counts as documented
// when its id, name or label appears in a registry. On this machine, a Codex
// automation can be paused, resumed, edited and archived, and one of your
// launchd agents stopped, started and restarted.

import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { Data, Effect } from "effect";
import { parse as parseToml } from "smol-toml";
import { z } from "zod";

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
  /** Where the file is, from ~ of its machine. */
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

export type MachineAutomations = {
  codex: CodexAutomation[];
  /** Null when the machine is not a Mac. */
  launchd: LaunchAgent[] | null;
};

export type Registry = {
  space: string;
  /** Relative to the instance. */
  path: string;
};

export type Automations = MachineAutomations & {
  registries: Registry[];
  /** The other machines of machines.json, read on demand (`readMachine`). */
  machines: string[];
};

export type RegistryFile = Registry & { markdown: string; hash: string; sections: Heading[] };

export type CodexFile = { path: string; id: string; text: string; hash: string };

export class RegistryNotFound extends Data.TaggedError("RegistryNotFound")<{ space: string }> {}

/** Not an automation Opai may change on this machine. */
export class AutomationNotFound extends Data.TaggedError("AutomationNotFound")<{
  target: string;
}> {}

/** An edit that would not leave a valid automation. */
export class AutomationInvalid extends Data.TaggedError("AutomationInvalid")<{
  message: string;
}> {}

/** SSH or a command failed. */
export class MachineUnreachable extends Data.TaggedError("MachineUnreachable")<{
  machine: string;
  message: string;
}> {}

// --- Registry --------------------------------------------------------------

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

// --- Reading a machine --------------------------------------------------------

type Plist = Record<string, unknown>;

/** What one machine holds, as read on it: file contents, not yet understood. */
type Source = {
  home: string;
  codex: { path: string; text: string }[];
  /** Null off macOS. */
  plists: { path: string; data: Plist }[] | null;
  launchctl: string;
};

/** A path from ~ of the machine whose home is `home`. */
const fromHome = (home: string, path: string) =>
  path === home || path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;

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

function codexAutomation(
  file: { path: string; text: string },
  home: string,
  documented: string,
  now: Date,
): CodexAutomation[] {
  let data: Record<string, unknown>;
  try {
    data = parseToml(file.text) as Record<string, unknown>;
  } catch {
    return [];
  }
  const id = typeof data.id === "string" ? data.id : basename(dirname(file.path));
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
      path: fromHome(home, file.path),
      documented: documented.includes(id) || documented.includes(name),
    },
  ];
}

function codexFiles(codexHomes: string[]) {
  const seen = new Set<string>();
  return codexHomes.flatMap((home) =>
    folders(join(home, "automations")).flatMap((folder) => {
      const path = join(home, "automations", folder, "automation.toml");
      if (!existsSync(path) || seen.has(path)) return [];
      seen.add(path);
      return [{ path, text: readFileSync(path, "utf8") }];
    }),
  );
}

/** The Codex app automations of every folder given. */
export function readCodexAutomations(codexHomes: string[], documented: string, now = new Date()) {
  return codexFiles(codexHomes).flatMap((file) =>
    codexAutomation(file, homedir(), documented, now),
  );
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
function fromApp(path: string | undefined, home: string) {
  if (!path) return true;
  return (
    /^\/(Applications|Library|System)\//.test(path) ||
    path.startsWith(`${home}/Library/`) ||
    path.includes(".app/")
  );
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

function launchAgents(source: Source, documented: string): LaunchAgent[] | null {
  if (!source.plists) return null;
  const states = parseLaunchctlList(source.launchctl);
  return source.plists
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(({ path, data }) => {
      const label = typeof data.Label === "string" ? data.Label : basename(path, ".plist");
      const state = states.get(label);
      const args = programArguments(data);
      return {
        label,
        command: args
          .map((arg) =>
            /^[A-Z_][A-Z0-9_]*=/.test(arg) ? `${arg.split("=")[0]}=…` : fromHome(source.home, arg),
          )
          .join(" "),
        schedule: schedule(data),
        state: state ? { loaded: true, ...state } : { loaded: false },
        fromApp: fromApp(program(args), source.home),
        path: fromHome(source.home, path),
        documented: documented.includes(label),
      };
    });
}

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

function plistsOf(folder: string) {
  let files: string[];
  try {
    files = readdirSync(folder).filter((file) => file.endsWith(".plist"));
  } catch {
    return [];
  }
  return files.flatMap((file) => {
    const data = readPlist(join(folder, file));
    return data ? [{ path: join(folder, file), data }] : [];
  });
}

/** The launchd agents of a folder, with their state. */
export function readLaunchAgents(folder: string, launchctl: string, documented: string) {
  return (
    launchAgents({ home: homedir(), codex: [], plists: plistsOf(folder), launchctl }, documented) ??
    []
  );
}

function launchctlList() {
  try {
    return execFileSync("launchctl", ["list"], { encoding: "utf8", timeout: 5_000 });
  } catch {
    return "";
  }
}

function describe(source: Source, documented: string, now = new Date()): MachineAutomations {
  return {
    codex: source.codex.flatMap((file) => codexAutomation(file, source.home, documented, now)),
    launchd: launchAgents(source, documented),
  };
}

const codexHomes = (root: string) => [join(homedir(), ".codex"), join(root, "codex")];
const agentsFolder = () => join(homedir(), "Library", "LaunchAgents");

function localSource(root: string): Source {
  const mac = process.platform === "darwin";
  return {
    home: homedir(),
    codex: codexFiles(codexHomes(root)),
    plists: mac ? plistsOf(agentsFolder()) : null,
    launchctl: mac ? launchctlList() : "",
  };
}

/** Everything the Automations page shows of this machine. */
export const getAutomations = (root: string) =>
  Effect.sync((): Automations => ({
    registries: listRegistries(root),
    machines: readMachines(root).map((machine) => machine.name),
    ...describe(localSource(root), registryText(root)),
  }));

// --- Other machines -----------------------------------------------------------

const Machines = z.object({
  machines: z.array(z.object({ name: z.string().min(1), ssh: z.string().min(1) })),
});

/** machines.json at the root of the instance: the machines to read through SSH. */
export function readMachines(root: string) {
  const file = join(root, "machines.json");
  if (!existsSync(file)) return [];
  return Machines.parse(JSON.parse(readFileSync(file, "utf8"))).machines;
}

// Run on the other machine: every automation file and plist, then the
// launchd state, each part after a marker line.
const REMOTE_SCRIPT = `
printf '@@home %s\\n' "$HOME"
for f in "$HOME"/.codex/automations/*/automation.toml; do
  [ -f "$f" ] && { printf '@@codex %s\\n' "$f"; cat "$f"; printf '\\n'; }
done
if command -v launchctl >/dev/null 2>&1; then
  for f in "$HOME"/Library/LaunchAgents/*.plist; do
    [ -f "$f" ] && { printf '@@plist %s\\n' "$f"; plutil -convert json -o - "$f" 2>/dev/null; printf '\\n'; }
  done
  printf '@@launchctl\\n'
  launchctl list
fi
`;

/** The output of REMOTE_SCRIPT, as a source. */
export function parseRemote(output: string): Source {
  const source: Source = { home: "", codex: [], plists: null, launchctl: "" };
  const parts = output.split(/^@@/m).slice(1);
  for (const part of parts) {
    const newline = part.indexOf("\n");
    const head = newline === -1 ? part : part.slice(0, newline);
    const body = newline === -1 ? "" : part.slice(newline + 1);
    const [kind = "", ...rest] = head.split(" ");
    const value = rest.join(" ");
    if (kind === "home") source.home = value;
    else if (kind === "codex") source.codex.push({ path: value, text: body });
    else if (kind === "plist") {
      source.plists ??= [];
      try {
        source.plists.push({ path: value, data: JSON.parse(body) as Plist });
      } catch {
        // A plist plutil could not read.
      }
    } else if (kind === "launchctl") {
      source.plists ??= [];
      source.launchctl = body;
    }
  }
  return source;
}

/** One machine of machines.json, read through SSH. Slow: a few seconds. */
export const readMachine = (root: string, name: string) =>
  Effect.gen(function* () {
    const machine = readMachines(root).find((candidate) => candidate.name === name);
    if (!machine) return yield* Effect.fail(new AutomationNotFound({ target: name }));
    const output = yield* Effect.tryPromise({
      try: () =>
        new Promise<string>((resolvePromise, reject) => {
          const child = execFile(
            "ssh",
            ["-o", "BatchMode=yes", "-o", "ConnectTimeout=5", machine.ssh, "sh -s"],
            { timeout: 20_000, maxBuffer: 16 * 1024 * 1024 },
            (error, stdout, stderr) =>
              error ? reject(new Error(stderr.trim() || error.message)) : resolvePromise(stdout),
          );
          child.stdin?.end(REMOTE_SCRIPT);
        }),
      catch: (cause) =>
        new MachineUnreachable({
          machine: name,
          message: cause instanceof Error ? cause.message : String(cause),
        }),
    });
    return describe(parseRemote(output), registryText(root));
  });

// --- Changing an automation on this machine -----------------------------------

/** The automation.toml a page path names, if it is one Opai may change. */
function codexFile(root: string, path: string) {
  const file = resolve(path.replace(/^~(?=\/)/, homedir()));
  const allowed = codexHomes(root).some(
    (home) => dirname(dirname(file)) === join(home, "automations"),
  );
  return allowed && basename(file) === "automation.toml" && existsSync(file) ? file : undefined;
}

const findCodex = (root: string, path: string) =>
  Effect.gen(function* () {
    const file = codexFile(root, path);
    if (!file) return yield* Effect.fail(new AutomationNotFound({ target: path }));
    return file;
  });

function parseAutomation(text: string) {
  try {
    return parseToml(text) as Record<string, unknown>;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

export const getCodexFile = (root: string, path: string) =>
  Effect.gen(function* () {
    const file = yield* findCodex(root, path);
    const text = yield* readText(file);
    const data = parseAutomation(text);
    const id =
      data instanceof Error || typeof data.id !== "string" ? basename(dirname(file)) : data.id;
    const result: CodexFile = { path: homePath(file), id, text, hash: hashText(text) };
    return result;
  });

/** Replaces an automation.toml, if it stays valid and nobody changed it since `baseHash`. */
export const updateCodexFile = (root: string, path: string, text: string, baseHash: string) =>
  Effect.gen(function* () {
    const file = yield* findCodex(root, path);
    const current = yield* readText(file);
    if (hashText(current) !== baseHash) return yield* new StaleWrite({ path: homePath(file) });
    const before = parseAutomation(current);
    const after = parseAutomation(text);
    if (after instanceof Error) {
      return yield* new AutomationInvalid({ message: `Not valid TOML: ${after.message}` });
    }
    if (!(before instanceof Error) && after.id !== before.id) {
      return yield* new AutomationInvalid({ message: "The id cannot change." });
    }
    if (!["ACTIVE", "PAUSED"].includes(String(after.status))) {
      return yield* new AutomationInvalid({ message: 'status must be "ACTIVE" or "PAUSED".' });
    }
    yield* writeText(file, text);
    return yield* getCodexFile(root, path);
  });

/** Pauses or resumes a Codex automation: its `status` line, and `updated_at`. */
export const setCodexStatus = (root: string, path: string, status: "active" | "paused") =>
  Effect.gen(function* () {
    const file = yield* findCodex(root, path);
    const text = yield* readText(file);
    const value = status === "paused" ? "PAUSED" : "ACTIVE";
    if (!/^status\s*=.*$/m.test(text)) {
      return yield* new AutomationInvalid({ message: "The file has no status line." });
    }
    const next = text
      .replace(/^status\s*=.*$/m, `status = "${value}"`)
      .replace(/^updated_at\s*=.*$/m, `updated_at = ${Date.now()}`);
    yield* writeText(file, next);
  });

/** Moves a Codex automation's folder to .local/archive/codex-automations/ of the instance. */
export const archiveCodex = (root: string, path: string) =>
  Effect.gen(function* () {
    const file = yield* findCodex(root, path);
    const folder = dirname(file);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
    const archive = join(root, ".local", "archive", "codex-automations");
    const target = join(archive, `${basename(folder)}-${stamp}`);
    yield* Effect.sync(() => {
      mkdirSync(archive, { recursive: true });
      renameSync(folder, target);
    });
    return homePath(target);
  });

export type AgentAction = "stop" | "start" | "restart";

/** Stops, starts or restarts one of your launchd agents (never one an app installed). */
export const controlAgent = (root: string, label: string, action: AgentAction) =>
  Effect.gen(function* () {
    if (process.platform !== "darwin") {
      return yield* Effect.fail(new AutomationNotFound({ target: label }));
    }
    const source = localSource(root);
    const agent = launchAgents(source, "")?.find((candidate) => candidate.label === label);
    if (!agent || agent.fromApp)
      return yield* Effect.fail(new AutomationNotFound({ target: label }));
    const domain = `gui/${process.getuid?.() ?? 501}`;
    const plist = resolve(agent.path.replace(/^~(?=\/)/, homedir()));
    const args =
      action === "stop"
        ? ["bootout", `${domain}/${label}`]
        : action === "start"
          ? ["bootstrap", domain, plist]
          : ["kickstart", "-k", `${domain}/${label}`];
    yield* Effect.try({
      try: () => execFileSync("launchctl", args, { encoding: "utf8", timeout: 10_000 }),
      catch: (cause) =>
        new MachineUnreachable({
          machine: "this Mac",
          message: `launchctl ${args.join(" ")}: ${cause instanceof Error ? cause.message : String(cause)}`,
        }),
    });
  });
