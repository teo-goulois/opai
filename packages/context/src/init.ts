// Creates an instance and points its tool configs to this engine.
//
//   node init.ts init [folder]   copy template/ into the folder (OPAI_HOME,
//                                ~/.opai by default) if it holds no instance
//                                yet, then set it up
//   node init.ts setup           set up the instance in OPAI_HOME again, after
//                                the engine or the instance moved
//
// Setting up only touches what Opai owns: its SessionStart hook in
// claude/settings.json and codex/hooks.json, its MCP server (a marked block in
// codex/config.toml, `claude mcp add` for Claude Code), the instruction links
// and the skill links. Everything else in those files is kept.
//
// Several machines can share one instance through Git. The tracked files name
// the engine and node only through two links in .local/ (ignored by Git),
// which each machine's setup points to its own, and name the instance from
// $HOME when it lives there.

import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, resolve, sep } from "node:path";

import { link } from "./skills.ts";
import { ENGINE, homePath, ROOT } from "./spaces.ts";

export type Paths = {
  /** The instance folder. */
  home: string;
  /** The engine's repository. */
  engine: string;
  /** The node binary the hooks and the MCP server run with. */
  node: string;
};

export type SetupReport = { changed: string[]; notes: string[] };

const HOOK_MARK = "/packages/context/src/hook.ts";
const TOML_START = "# >>> opai: written by `opai setup`, edit outside this block";
const TOML_END = "# <<< opai";

/** Copies template/ into `home`. Refuses a folder that holds anything else. */
export function createInstance(home: string, engine = ENGINE) {
  if (existsSync(join(home, "spaces"))) return false;
  if (existsSync(home) && readdirSync(home).length > 0) {
    throw new Error(`${homePath(home)} is not empty and holds no instance (no spaces/).`);
  }
  cpSync(join(engine, "template"), home, { recursive: true });
  renameSync(join(home, "gitignore"), join(home, ".gitignore"));
  return true;
}

/** Points the instance's tool configs to the engine. Safe to run again. */
export function setupInstance({ home, engine, node }: Paths): SetupReport {
  const report: SetupReport = { changed: [], notes: [] };
  for (const path of [home, engine, node]) {
    if (/["$`\\\n]/.test(path)) throw new Error(`Unsupported character in ${path}`);
  }
  mkdirSync(join(home, ".local"), { recursive: true });
  for (const [name, target] of Object.entries({ node, engine })) {
    const path = join(home, ".local", name);
    if (present(path) && readlinkSync(path) === target) continue;
    rmSync(path, { force: true });
    symlinkSync(target, path);
    report.changed.push(`.local/${name} → ${homePath(target)} (this machine's)`);
  }
  const at = portable(home);
  const env = `OPAI_HOME="${at}"`;
  const run = (script: string) =>
    `"${at}/.local/node" "${at}/.local/engine/packages/context/src/${script}"`;
  const hook = `${env} ${run("hook.ts")} session`;

  for (const tool of ["claude", "codex"]) {
    mkdirSync(join(home, tool), { recursive: true });
    if (!existsSync(join(home, tool, ".gitkeep"))) writeFileSync(join(home, tool, ".gitkeep"), "");
  }
  for (const file of ["claude/CLAUDE.md", "codex/AGENTS.md"]) {
    const path = join(home, file);
    if (!present(path)) {
      symlinkSync("../spaces/global/AGENTS.md", path);
      report.changed.push(`${file} → spaces/global/AGENTS.md`);
    }
  }

  editJson(home, "claude/settings.json", report, (settings) => {
    // Claude reads ~/.claude/CLAUDE.md as the instructions of a parent folder
    // of every project under ~, whatever its config folder. Each machine adds
    // its own home folder.
    settings.claudeMdExcludes = union(settings.claudeMdExcludes, [
      join(homedir(), ".claude", "**"),
    ]);
    settings.hooks = withHook(settings.hooks, hook);
    const permissions = object(settings.permissions);
    permissions.allow = union(permissions.allow, ["mcp__opai"]);
    settings.permissions = permissions;
  });
  editJson(home, "codex/hooks.json", report, (hooks) => {
    hooks.hooks = withHook(hooks.hooks, hook);
  });
  editToml(home, report, [
    TOML_START,
    "[mcp_servers.opai]",
    // Through a shell, so that $HOME is this machine's.
    'command = "/bin/sh"',
    `args = ["-c", ${JSON.stringify(`${env} exec ${run("mcp.ts")}`)}]`,
    "",
    "# The writing tools only create new files in spaces/<space>/agents/.",
    "[mcp_servers.opai.tools.journal_append]",
    'approval_mode = "approve"',
    "",
    "[mcp_servers.opai.tools.issue_record]",
    'approval_mode = "approve"',
    TOML_END,
  ]);

  const links = link(home);
  report.changed.push(...links.added.map((path) => `${path} (link)`));
  report.notes.push(...links.conflicts);

  if (!existsSync(join(home, ".git"))) {
    execFileSync("git", ["init", "-q", "-b", "main", home]);
    report.changed.push(".git (new repository)");
  }
  const hooksPath = join(engine, ".githooks");
  if (gitConfig(home, "core.hooksPath") !== hooksPath) {
    execFileSync("git", ["-C", home, "config", "core.hooksPath", hooksPath]);
    report.changed.push(`core.hooksPath → ${homePath(hooksPath)} (secret scan before each commit)`);
  }
  report.notes.push("Codex runs the new hook only after you trust it: run /hooks in Codex.");
  return report;
}

/** Declares the MCP server to Claude Code, which keeps it in claude/.claude.json. */
export function registerClaudeMcp({ home, engine, node }: Paths) {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: join(home, "claude") };
  spawnSync("claude", ["mcp", "remove", "-s", "user", "opai"], { env, stdio: "ignore" });
  const mcp = join(engine, "packages", "context", "src", "mcp.ts");
  const added = spawnSync(
    "claude",
    // The name goes first: -e takes every value up to the next option.
    ["mcp", "add", "opai", "-s", "user", "-e", `OPAI_HOME=${home}`, "--", node, mcp],
    { env, stdio: "ignore" },
  );
  return added.status === 0;
}

// --- Helpers ----------------------------------------------------------------

type Json = Record<string, unknown>;

/** A path under the user's home folder written from $HOME, for a shell to expand. */
function portable(path: string) {
  const home = homedir();
  return path.startsWith(home + sep) ? `$HOME${path.slice(home.length)}` : path;
}

function present(path: string) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function object(value: unknown): Json {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...(value as Json) }
    : {};
}

function union(value: unknown, items: string[]) {
  const list = Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  return [...list, ...items.filter((item) => !list.includes(item))];
}

/** The hooks object with one SessionStart entry for Opai's hook, replacing an older one. */
function withHook(value: unknown, command: string) {
  const hooks = object(value);
  const entries = Array.isArray(hooks.SessionStart) ? hooks.SessionStart : [];
  const others = entries.filter((entry) => !JSON.stringify(entry).includes(HOOK_MARK));
  hooks.SessionStart = [...others, { hooks: [{ type: "command", command, timeout: 5 }] }];
  return hooks;
}

function editJson(home: string, file: string, report: SetupReport, edit: (data: Json) => void) {
  const path = join(home, file);
  const before = existsSync(path) ? readFileSync(path, "utf8") : "";
  const data = before.trim() ? object(JSON.parse(before)) : {};
  edit(data);
  const after = `${JSON.stringify(data, null, 2)}\n`;
  if (after !== before) {
    writeFileSync(path, after);
    report.changed.push(file);
  }
}

function editToml(home: string, report: SetupReport, block: string[]) {
  const path = join(home, "codex", "config.toml");
  const before = existsSync(path) ? readFileSync(path, "utf8") : "";
  const text = block.join("\n");
  const start = before.indexOf(TOML_START);
  const end = before.indexOf(TOML_END);
  const after =
    start !== -1 && end > start
      ? before.slice(0, start) + text + before.slice(end + TOML_END.length)
      : `${before}${before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : ""}${text}\n`;
  if (after !== before) {
    writeFileSync(path, after);
    report.changed.push("codex/config.toml");
  }
}

function gitConfig(home: string, key: string) {
  try {
    return execFileSync("git", ["-C", home, "config", "--get", key], { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

function onPath(binary: string) {
  return (process.env.PATH ?? "")
    .split(delimiter)
    .some((folder) => folder && existsSync(join(folder, binary)));
}

// --- Command line -------------------------------------------------------------

function print(report: SetupReport) {
  for (const line of report.changed) console.log(`  set  ${line}`);
  for (const line of report.notes) console.log(`  note ${line}`);
}

function main([command, folder]: string[]) {
  const paths: Paths = {
    home: command === "init" && folder ? resolve(folder) : ROOT,
    engine: ENGINE,
    node: process.env.OPAI_NODE || process.execPath,
  };
  if (command !== "init" && command !== "setup") {
    console.error("usage: opai init [folder] | opai setup");
    process.exitCode = 2;
    return;
  }
  if (command === "setup" && !existsSync(join(paths.home, "spaces"))) {
    throw new Error(`No instance in ${homePath(paths.home)}. Run: opai init`);
  }
  if (command === "init") {
    const created = createInstance(paths.home);
    console.log(
      created
        ? `Created an instance in ${homePath(paths.home)}.`
        : `${homePath(paths.home)} already holds an instance: setting it up again.`,
    );
  }
  print(setupInstance(paths));

  if (onPath("claude")) {
    console.log(
      registerClaudeMcp(paths)
        ? "  set  Claude Code MCP server opai (claude/.claude.json)"
        : "  note Could not add the MCP server to Claude Code: run opai setup again.",
    );
  } else {
    console.log("  note Claude Code is not installed: run opai setup after installing it.");
  }

  if (paths.home !== resolve(homedir(), ".opai")) {
    console.log(`\nThe instance is not ~/.opai: export OPAI_HOME=${homePath(paths.home)}`);
  }
  console.log("\nNext: opai claude, opai codex, or opai app for the interface.");
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`opai: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
