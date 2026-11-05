// Which space a folder belongs to. No dependencies, so the session hook
// starts fast; the MCP procedures use the same functions.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";

export type Space = {
  name: string;
  base: boolean;
  default: boolean;
  /** Absolute, resolved folders the space claims. */
  paths: string[];
  /** Global modules turned off in the space. */
  disable: string[];
};

export type Match = {
  space: Space;
  /** The claimed folder that matched, or undefined for the default space. */
  path: string | undefined;
};

const HOME = homedir();
const HOOK = join(import.meta.dirname, "hook.ts");

/** The repository this package lives in: the engine's code. */
export const ENGINE = resolve(import.meta.dirname, "../../..");

/**
 * The instance: the folder of spaces, rules, records and tool configs that
 * every procedure reads and writes. OPAI_HOME points to it, ~/.opai by default.
 */
export const ROOT = resolve(expandHome(process.env.OPAI_HOME || "~/.opai"));

function scalar(text: string): string | boolean {
  const value = text.trim();
  const quote = value[0];
  if (value.length >= 2 && (quote === '"' || quote === "'") && value.endsWith(quote)) {
    return value.slice(1, -1);
  }
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

/** The flat subset space.yaml uses: `key: value`, and `key:` followed by `- item` lines. */
export function readYaml(text: string) {
  const data: Record<string, string | boolean | string[]> = {};
  let key: string | undefined;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if ((line.startsWith(" ") || line.startsWith("\t")) && trimmed.startsWith("- ") && key) {
      const list = data[key];
      const item = String(scalar(trimmed.slice(2)));
      data[key] = Array.isArray(list) ? [...list, item] : [item];
      continue;
    }
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1);
    if (value.trim()) data[key] = scalar(value);
  }
  return data;
}

function expandHome(path: string) {
  return path === "~" || path.startsWith("~/") ? join(HOME, path.slice(1)) : path;
}

/** The real path when it exists, so symlinked folders compare equal. */
function real(path: string) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function list(value: string | boolean | string[] | undefined) {
  return Array.isArray(value) ? value : [];
}

export function loadSpaces(root: string): Space[] {
  const folder = join(root, "spaces");
  // A new, empty instance has no space yet.
  if (!existsSync(folder)) return [];
  const names = readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const spaces: Space[] = [];
  for (const name of names) {
    const file = join(folder, name, "space.yaml");
    if (!existsSync(file)) continue;
    const data = readYaml(readFileSync(file, "utf8"));
    spaces.push({
      name,
      base: data.base === true,
      default: data.default === true,
      paths: list(data.paths).map((path) => real(expandHome(path))),
      disable: list(data.disable),
    });
  }
  return spaces;
}

function git(folder: string, ...args: string[]) {
  try {
    const out = execFileSync("git", ["-C", folder, ...args], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

/** The same folder in the main working tree, when `folder` is in a Git worktree. */
export function inMainRepository(folder: string) {
  const top = git(folder, "rev-parse", "--show-toplevel");
  const common = git(folder, "rev-parse", "--path-format=absolute", "--git-common-dir");
  if (!top || !common || !common.endsWith(`${sep}.git`)) return undefined;
  const main = real(common.slice(0, -`${sep}.git`.length));
  const worktree = real(top);
  if (main === worktree) return undefined;
  return join(main, relative(worktree, folder));
}

function contains(parent: string, child: string) {
  return child === parent || child.startsWith(parent + sep);
}

function depth(path: string) {
  return path.split(sep).length;
}

/** The space with the longest claimed path containing the folder; the default space otherwise. */
export function which(root: string, folder: string, spaces = loadSpaces(root)): Match | undefined {
  const target = real(folder);
  const candidates = [target];
  const mirror = inMainRepository(target);
  if (mirror) candidates.push(mirror);
  let best: Match | undefined;
  for (const space of spaces) {
    for (const path of space.paths) {
      if (!candidates.some((candidate) => contains(path, candidate))) continue;
      if (!best?.path || depth(path) > depth(best.path)) best = { space, path };
    }
  }
  if (best) return best;
  const fallback = spaces.find((space) => space.default);
  return fallback ? { space: fallback, path: undefined } : undefined;
}

export function homePath(path: string) {
  return path.startsWith(HOME + sep) ? `~${path.slice(HOME.length)}` : path;
}

/** Where things of a space live on disk. */
export function spaceFolders(root: string, name: string) {
  const folder = join(root, "spaces", name);
  return {
    folder,
    rules: join(folder, "AGENTS.md"),
    context: join(folder, "context"),
    memory: join(folder, "context", "memory"),
    agents: join(folder, "agents"),
  };
}

/** The rules of a space that is not the base one, or undefined when it has none. */
export function spaceRules(root: string, space: Space) {
  const { rules } = spaceFolders(root, space.name);
  if (space.base || !existsSync(rules)) return undefined;
  return readFileSync(rules, "utf8").trim();
}

/** What the session hook tells the agent about its space. */
export function sessionContext(root: string, folder: string) {
  const match = which(root, folder);
  if (!match) return "";
  const { space, path } = match;
  const folders = spaceFolders(root, space.name);
  const where = path
    ? `${homePath(path)} is in it`
    : "no space claims this folder, so the default one";
  const lines = [`Space of this session: ${space.name} (${where}).`];
  if (space.disable.length > 0) {
    lines.push(`- Global modules turned off here: ${space.disable.join(", ")}.`);
  }
  if (existsSync(folders.context)) {
    lines.push(
      `- The user's notes for this space: ${homePath(folders.context)}/. Change them only with the user's yes, asked in the task or given in one of their rules; otherwise propose the change and record what you found with journal_append.`,
    );
  }
  lines.push(
    "- Record finished work with the MCP tool journal_append, and problems the user reports about " +
      `your work with issue_record. They write to ${homePath(folders.agents)}/.`,
  );
  lines.push(
    "- If the work moves to a project of another space, call the MCP tool space_current " +
      `with that folder (or run \`node ${homePath(HOOK)} which <folder>\`) and follow that space instead.`,
  );
  const rules = spaceRules(root, space);
  if (rules) {
    lines.push(
      "",
      `Rules of the ${space.name} space (${homePath(folders.rules)}). ` +
        "They win over the global rules where they conflict:",
      "",
      rules,
    );
  }
  return lines.join("\n");
}
