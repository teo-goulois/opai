// Skills. Each one lives once, in spaces/<space>/skills/<name>/. Those of
// global are in every session; those of another space only in sessions of
// that space. Claude Code and Codex read them through links that `link` keeps:
//
// - claude/skills/<name>: the global skills. The skills of a space reach Claude
//   as a plugin, .local/plugins/<space>/, that opai loads with --plugin-dir in
//   that space's sessions; Claude names them <space>:<name>.
// - codex/skills/<name>: every skill. opai turns off, at launch, those of the
//   other spaces (skills.config), so opai owns skills.config.
//
// An imported skill keeps where it comes from in .source.json, next to its
// SKILL.md: the source, and digests of the upstream copy and of ours, to tell
// an upstream change from a local one.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import { parse as parseYaml, parseDocument } from "yaml";

import { homePath, loadSpaces, which } from "./spaces.ts";

export type SkillSource =
  | { type: "github"; repo: string; path: string; ref?: string | undefined }
  | { type: "url"; url: string }
  | { type: "local"; path: string };

/** What .source.json holds. */
export type Provenance = {
  source: SkillSource;
  /** The upstream commit, for a GitHub source. */
  revision?: string | undefined;
  /** Digest of the upstream files when last imported or updated. */
  upstream: string;
  /** Digest of our copy right after that. A different digest now means local changes. */
  local: string;
  updatedAt: string;
  /** Why our copy differs from upstream, if it does on purpose. */
  notes?: string | undefined;
};

export type Skill = {
  name: string;
  space: string;
  /** spaces/<space>/skills/<name>, from the instance. */
  folder: string;
  description: string;
  /** disable-model-invocation: only when asked for, with /name or $name. */
  explicitOnly: boolean;
  provenance?: Provenance | undefined;
  /** Changed since it was imported or updated. */
  modified: boolean;
};

export class SkillError extends Error {}

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SOURCE_FILE = ".source.json";

// --- Reading ---------------------------------------------------------------

/** The YAML front matter of a SKILL.md, or undefined when it has none. */
export function frontMatter(text: string): Record<string, unknown> | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) return undefined;
  try {
    const data = parseYaml(match[1]!);
    return data && typeof data === "object" ? (data as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export function skillsFolder(root: string, space: string) {
  return join(root, "spaces", space, "skills");
}

/** Folder names in `path`, links to folders included; none when it doesn't exist. */
function folders(path: string) {
  try {
    return readdirSync(path)
      .filter((name) => !name.startsWith(".") && isFolder(join(path, name)))
      .sort();
  } catch {
    return [];
  }
}

function isFolder(path: string) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Every file of a folder, as sorted relative paths; .source.json and .git left out. */
function files(folder: string, prefix = ""): string[] {
  return readdirSync(join(folder, prefix), { withFileTypes: true })
    .flatMap((entry) => {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.name === ".git" || entry.name === ".DS_Store" || path === SOURCE_FILE) return [];
      return entry.isDirectory() ? files(folder, path) : [path];
    })
    .sort();
}

/** A digest of a skill's files and their contents. */
export function digest(folder: string) {
  const hash = createHash("sha256");
  for (const path of files(folder)) {
    hash.update(`${path}\0`);
    hash.update(readFileSync(join(folder, path)));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

function readProvenance(folder: string): Provenance | undefined {
  try {
    return JSON.parse(readFileSync(join(folder, SOURCE_FILE), "utf8")) as Provenance;
  } catch {
    return undefined;
  }
}

function readSkill(root: string, space: string, name: string): Skill {
  const folder = join(skillsFolder(root, space), name);
  let meta: Record<string, unknown> = {};
  try {
    meta = frontMatter(readFileSync(join(folder, "SKILL.md"), "utf8")) ?? {};
  } catch {
    // check reports the missing SKILL.md.
  }
  const provenance = readProvenance(folder);
  return {
    name,
    space,
    folder: relative(root, folder),
    description: typeof meta.description === "string" ? meta.description : "",
    explicitOnly: meta["disable-model-invocation"] === true,
    provenance,
    modified: provenance ? digest(folder) !== provenance.local : false,
  };
}

/** Every skill, global first, then by space and name. */
export function listSkills(root: string): Skill[] {
  const spaces = loadSpaces(root).sort((a, b) => Number(b.base) - Number(a.base));
  return spaces.flatMap((space) =>
    folders(skillsFolder(root, space.name)).map((name) => readSkill(root, space.name, name)),
  );
}

function findSkill(root: string, name: string) {
  const skill = listSkills(root).find((item) => item.name === name);
  if (!skill) throw new SkillError(`No skill named ${name}.`);
  return skill;
}

function baseSpace(root: string) {
  return loadSpaces(root).find((space) => space.base)?.name ?? "global";
}

// --- Links -----------------------------------------------------------------

/** A link this module made: a symbolic link into spaces/. */
function owned(root: string, path: string) {
  try {
    if (!lstatSync(path).isSymbolicLink()) return false;
    const target = resolve(dirname(path), readlinkSync(path));
    return target.startsWith(join(root, "spaces") + sep);
  } catch {
    return false;
  }
}

function pluginFolder(root: string, space: string) {
  return join(root, ".local", "plugins", space);
}

/** The plugin that brings a space's skills to Claude Code. Rebuilt when missing. */
export function ensurePlugin(root: string, space: string) {
  const folder = pluginFolder(root, space);
  const skills = join(folder, "skills");
  mkdirSync(join(folder, ".claude-plugin"), { recursive: true });
  const manifest = join(folder, ".claude-plugin", "plugin.json");
  const text = `${JSON.stringify({ name: space, description: `Skills of the ${space} space of the instance.` }, null, 2)}\n`;
  if (!existsSync(manifest) || readFileSync(manifest, "utf8") !== text)
    writeFileSync(manifest, text);
  const target = relative(folder, skillsFolder(root, space));
  if (
    !existsSync(skills) ||
    !lstatSync(skills).isSymbolicLink() ||
    readlinkSync(skills) !== target
  ) {
    rmSync(skills, { force: true, recursive: true });
    symlinkSync(target, skills);
  }
  return folder;
}

/** Codex's agents/openai.yaml says the same as disable-model-invocation. */
function syncPolicy(root: string, skill: Skill) {
  const path = join(root, skill.folder, "agents", "openai.yaml");
  const exists = existsSync(path);
  if (!exists && !skill.explicitOnly) return false;
  const doc = parseDocument(exists ? readFileSync(path, "utf8") : "");
  const current = doc.getIn(["policy", "allow_implicit_invocation"]);
  if (skill.explicitOnly) {
    if (current === false) return false;
    doc.setIn(["policy", "allow_implicit_invocation"], false);
  } else {
    if (current !== false) return false;
    doc.deleteIn(["policy", "allow_implicit_invocation"]);
    const policy = doc.get("policy");
    if (
      policy &&
      typeof policy === "object" &&
      "items" in policy &&
      !(policy.items as unknown[]).length
    ) {
      doc.delete("policy");
    }
  }
  const text = doc.toString();
  if (!text.trim() || text.trim() === "{}") rmSync(path);
  else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
  return true;
}

export type LinkReport = {
  added: string[];
  removed: string[];
  policies: string[];
  conflicts: string[];
};

/**
 * Makes claude/skills, codex/skills and the space plugins match spaces/*\/skills.
 * It only adds or removes its own links; any other file in the way is a conflict.
 */
export function link(root: string): LinkReport {
  const report: LinkReport = { added: [], removed: [], policies: [], conflicts: [] };
  const skills = listSkills(root);
  const base = baseSpace(root);
  const wanted = {
    claude: new Map(
      skills.filter((skill) => skill.space === base).map((skill) => [skill.name, skill]),
    ),
    codex: new Map(skills.map((skill) => [skill.name, skill])),
  };
  for (const tool of ["claude", "codex"] as const) {
    const folder = join(root, tool, "skills");
    mkdirSync(folder, { recursive: true });
    for (const name of readdirSync(folder)) {
      const path = join(folder, name);
      if (owned(root, path) && !wanted[tool].has(name)) {
        rmSync(path);
        report.removed.push(`${tool}/skills/${name}`);
      }
    }
    for (const [name, skill] of wanted[tool]) {
      const path = join(folder, name);
      const target = relative(folder, join(root, skill.folder));
      let present = false;
      try {
        lstatSync(path);
        present = true;
      } catch {
        // Not there yet.
      }
      if (present && !owned(root, path)) {
        report.conflicts.push(`${tool}/skills/${name} exists and is not a link this command made`);
        continue;
      }
      if (present && readlinkSync(path) === target) continue;
      if (present) rmSync(path);
      symlinkSync(target, path);
      report.added.push(`${tool}/skills/${name}`);
    }
  }
  const spaces = new Set(
    skills.filter((skill) => skill.space !== base).map((skill) => skill.space),
  );
  for (const space of spaces) ensurePlugin(root, space);
  // The plugin of a space with no skill left.
  const plugins = join(root, ".local", "plugins");
  for (const space of folders(plugins)) {
    if (!spaces.has(space)) rmSync(join(plugins, space), { recursive: true, force: true });
  }
  for (const skill of skills) if (syncPolicy(root, skill)) report.policies.push(skill.folder);
  return report;
}

// --- Launch ----------------------------------------------------------------

/** Claude Code commands that start no session: opai adds nothing to them. */
export const CLAUDE_COMMANDS = new Set([
  "mcp",
  "plugin",
  "plugins",
  "config",
  "doctor",
  "update",
  "install",
  "setup-token",
  "auth",
  "agents",
  "migrate-installer",
]);

/** A TOML basic string. */
function toml(text: string) {
  return JSON.stringify(text);
}

/**
 * The arguments opai adds when it starts Claude Code or Codex in `cwd`: the
 * session's space brings its skills, the other spaces' skills stay out.
 */
export function launchArgs(
  root: string,
  tool: "claude" | "codex",
  cwd: string,
  args: string[] = [],
) {
  const space = which(root, cwd)?.space;
  const base = baseSpace(root);
  const skills = listSkills(root);
  if (tool === "claude") {
    if (!space || space.name === base || CLAUDE_COMMANDS.has(args[0] ?? "")) return [];
    if (!skills.some((skill) => skill.space === space.name)) return [];
    return ["--plugin-dir", ensurePlugin(root, space.name)];
  }
  const off = [
    // Codex also reads ~/.agents/skills, a skill store outside the instance.
    ...folders(join(homedir(), ".agents", "skills"))
      .map((name) => join(homedir(), ".agents", "skills", name, "SKILL.md"))
      .filter((path) => existsSync(path))
      .map((path) => `{path=${toml(path)},enabled=false}`),
    ...skills
      .filter((skill) => skill.space !== base && skill.space !== space?.name)
      .map((skill) => `{name=${toml(skill.name)},enabled=false}`),
  ];
  return off.length > 0 ? ["-c", `skills.config=[${off.join(",")}]`] : [];
}

// --- Checks ----------------------------------------------------------------

/** What is wrong with the skills and their links; empty when all is well. */
export function checkSkills(root: string): string[] {
  const problems: string[] = [];
  const skills = listSkills(root);
  const seen = new Map<string, string>();
  for (const skill of skills) {
    const where = skill.folder;
    const file = join(root, skill.folder, "SKILL.md");
    if (!existsSync(file)) {
      problems.push(`${where}: no SKILL.md`);
      continue;
    }
    const meta = frontMatter(readFileSync(file, "utf8"));
    if (!meta) problems.push(`${where}/SKILL.md: no front matter`);
    else if (meta.name !== skill.name) {
      problems.push(
        `${where}/SKILL.md: name is ${JSON.stringify(meta.name)}, not the folder's ${skill.name}`,
      );
    }
    if (!NAME.test(skill.name) || skill.name.length > 64) {
      problems.push(`${where}: a name is lowercase letters, digits and hyphens, 64 at most`);
    }
    if (!skill.description) problems.push(`${where}/SKILL.md: no description`);
    else if (skill.description.length > 1024) {
      problems.push(`${where}/SKILL.md: description over 1024 characters`);
    }
    const other = seen.get(skill.name);
    if (other) problems.push(`${where}: same name as ${other}`);
    seen.set(skill.name, where);
    const policy = join(root, skill.folder, "agents", "openai.yaml");
    if (existsSync(policy)) {
      const value = parseDocument(readFileSync(policy, "utf8")).getIn([
        "policy",
        "allow_implicit_invocation",
      ]);
      if ((value === false) !== skill.explicitOnly) {
        problems.push(
          `${where}/agents/openai.yaml: policy differs from disable-model-invocation (run opai skills link)`,
        );
      }
    } else if (skill.explicitOnly) {
      problems.push(`${where}: explicit-only, but Codex is not told (run opai skills link)`);
    }
  }
  const base = baseSpace(root);
  const expect = (tool: string, name: string, folder: string) => {
    const path = join(root, tool, "skills", name);
    try {
      if (readlinkSync(path) !== relative(dirname(path), join(root, folder))) throw new Error();
    } catch {
      problems.push(`${tool}/skills/${name}: missing or wrong link (run opai skills link)`);
    }
  };
  for (const skill of skills) {
    if (skill.space === base) expect("claude", skill.name, skill.folder);
    expect("codex", skill.name, skill.folder);
  }
  for (const tool of ["claude", "codex"]) {
    const folder = join(root, tool, "skills");
    for (const name of existsSync(folder) ? readdirSync(folder) : []) {
      const path = join(folder, name);
      if (owned(root, path) && !existsSync(path))
        problems.push(`${tool}/skills/${name}: broken link`);
    }
  }
  const config = join(root, "codex", "config.toml");
  if (
    existsSync(config) &&
    /^\s*(\[\[skills\.config\]\]|skills\.config\s*=)/m.test(readFileSync(config, "utf8"))
  ) {
    problems.push(
      "codex/config.toml: skills.config is set by opai at launch; use disable-model-invocation instead",
    );
  }
  return problems;
}

// --- Import and update -------------------------------------------------------

/** A source as typed: owner/repo/path, a GitHub URL, the URL of a SKILL.md, or a folder. */
export function parseSource(text: string, cwd = process.cwd()): SkillSource {
  const value = text.trim();
  const local = resolve(cwd, value.replace(/^~(?=$|\/)/, homedir()));
  if (existsSync(local)) return { type: "local", path: local };
  const tree = /^https:\/\/github\.com\/([^/]+\/[^/]+?)\/(?:tree|blob)\/([^/]+)\/?(.*?)\/?$/.exec(
    value,
  );
  if (tree)
    return {
      type: "github",
      repo: tree[1]!,
      ref: tree[2],
      path: tree[3]!.replace(/\/?SKILL\.md$/, ""),
    };
  const repo = /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(value);
  if (repo) return { type: "github", repo: repo[1]!, path: "" };
  if (/^https?:\/\//.test(value)) return { type: "url", url: value };
  const short = /^([\w.-]+\/[\w.-]+)(?:\/(.+?))?\/?$/.exec(value);
  if (short)
    return { type: "github", repo: short[1]!, path: (short[2] ?? "").replace(/\/?SKILL\.md$/, "") };
  throw new SkillError(
    `Not a source: ${text}. Give owner/repo/path, a GitHub or SKILL.md URL, or a folder.`,
  );
}

export function describeSource(source: SkillSource) {
  if (source.type === "github") {
    return `github.com/${source.repo}${source.path ? `/${source.path}` : ""}${source.ref ? ` @ ${source.ref}` : ""}`;
  }
  return source.type === "url" ? source.url : homePath(source.path);
}

/** The one skill folder under `folder`: itself, or the only one below holding a SKILL.md. */
function skillIn(folder: string, label: string) {
  if (existsSync(join(folder, "SKILL.md"))) return folder;
  const found: string[] = [];
  const walk = (path: string, depth: number) => {
    if (depth > 4) return;
    for (const name of folders(path)) {
      const child = join(path, name);
      if (existsSync(join(child, "SKILL.md"))) found.push(child);
      else walk(child, depth + 1);
    }
  };
  walk(folder, 0);
  if (found.length === 1) return found[0]!;
  if (found.length === 0) throw new SkillError(`No SKILL.md in ${label}.`);
  const list = found.map((path) => relative(folder, path)).join(", ");
  throw new SkillError(`${label} holds several skills (${list}): add the path of one.`);
}

/** Downloads a source into a new temporary folder; the caller removes `cleanup`. */
async function fetchSource(source: SkillSource) {
  const temp = mkdtempSync(join(tmpdir(), "opai-skill-"));
  try {
    if (source.type === "local") {
      return {
        folder: skillIn(source.path, homePath(source.path)),
        revision: undefined,
        cleanup: temp,
      };
    }
    if (source.type === "url") {
      const response = await fetch(source.url);
      if (!response.ok) throw new SkillError(`${source.url} answered ${response.status}.`);
      const text = await response.text();
      if (!frontMatter(text))
        throw new SkillError(`${source.url} is not a SKILL.md: no front matter.`);
      const folder = join(temp, "skill");
      mkdirSync(folder);
      writeFileSync(join(folder, "SKILL.md"), text);
      return { folder, revision: undefined, cleanup: temp };
    }
    const clone = join(temp, "repo");
    const branch = source.ref ? ["--branch", source.ref] : [];
    try {
      execFileSync(
        "git",
        [
          "clone",
          "--quiet",
          "--depth",
          "1",
          ...branch,
          `https://github.com/${source.repo}.git`,
          clone,
        ],
        {
          stdio: ["ignore", "ignore", "pipe"],
        },
      );
    } catch (error) {
      const detail = error instanceof Error && "stderr" in error ? String(error.stderr).trim() : "";
      throw new SkillError(
        `Could not clone github.com/${source.repo}${detail ? `: ${detail}` : ""}.`,
      );
    }
    const revision = execFileSync("git", ["-C", clone, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    const base = join(clone, source.path);
    if (!existsSync(base)) throw new SkillError(`No ${source.path} in github.com/${source.repo}.`);
    return { folder: skillIn(base, describeSource(source)), revision, cleanup: temp };
  } catch (error) {
    rmSync(temp, { recursive: true, force: true });
    throw error;
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function writeProvenance(folder: string, provenance: Provenance) {
  const clean = Object.fromEntries(
    Object.entries(provenance).filter(([, value]) => value !== undefined),
  );
  writeFileSync(join(folder, SOURCE_FILE), `${JSON.stringify(clean, null, 2)}\n`);
}

function setName(folder: string, name: string) {
  const file = join(folder, "SKILL.md");
  const text = readFileSync(file, "utf8");
  writeFileSync(file, text.replace(/^(---\r?\n[\s\S]*?^name:)[^\n]*$/m, `$1 ${name}`));
}

function checkSpace(root: string, space: string) {
  if (!loadSpaces(root).some((item) => item.name === space))
    throw new SkillError(`No space named ${space}.`);
}

function taken(root: string, name: string) {
  const other = listSkills(root).find((skill) => skill.name === name);
  if (other) throw new SkillError(`A skill named ${name} already exists: ${other.folder}.`);
}

/** Copies a skill from a source into a space, with its provenance, then links it. */
export async function addSkill(
  root: string,
  text: string,
  options: {
    space?: string | undefined;
    name?: string | undefined;
    notes?: string | undefined;
  } = {},
) {
  const source = parseSource(text);
  const space = options.space ?? baseSpace(root);
  checkSpace(root, space);
  const fetched = await fetchSource(source);
  try {
    const meta = frontMatter(readFileSync(join(fetched.folder, "SKILL.md"), "utf8")) ?? {};
    const name =
      options.name ?? (typeof meta.name === "string" ? meta.name : basename(fetched.folder));
    if (!NAME.test(name)) throw new SkillError(`${name} is not a valid skill name: pass --name.`);
    taken(root, name);
    const folder = join(skillsFolder(root, space), name);
    mkdirSync(dirname(folder), { recursive: true });
    cpSync(fetched.folder, folder, {
      recursive: true,
      dereference: true,
      filter: (path) => basename(path) !== ".git" && basename(path) !== SOURCE_FILE,
    });
    const upstream = digest(fetched.folder);
    if (meta.name !== name) setName(folder, name);
    writeProvenance(folder, {
      source,
      revision: fetched.revision,
      upstream,
      local: digest(folder),
      updatedAt: today(),
      notes: options.notes,
    });
    link(root);
    return readSkill(root, space, name);
  } finally {
    rmSync(fetched.cleanup, { recursive: true, force: true });
  }
}

/** Records where an existing skill comes from, as it is now. */
export async function recordSource(root: string, name: string, text: string, notes?: string) {
  const skill = findSkill(root, name);
  const source = parseSource(text);
  const fetched = await fetchSource(source);
  try {
    const folder = join(root, skill.folder);
    writeProvenance(folder, {
      source,
      revision: fetched.revision,
      upstream: digest(fetched.folder),
      local: digest(folder),
      updatedAt: today(),
      notes,
    });
    return {
      skill: readSkill(root, skill.space, name),
      same: digest(fetched.folder) === digest(folder),
    };
  } finally {
    rmSync(fetched.cleanup, { recursive: true, force: true });
  }
}

/** The diff from our copy to upstream's, as ours/<name> and upstream/<name>; .source.json left out. */
function diff(ours: string, upstream: string, name: string) {
  const temp = mkdtempSync(join(tmpdir(), "opai-diff-"));
  const copy = (from: string, to: string) =>
    cpSync(from, join(temp, to, name), {
      recursive: true,
      dereference: true,
      filter: (path) => basename(path) !== ".git" && basename(path) !== SOURCE_FILE,
    });
  try {
    copy(ours, "ours");
    copy(upstream, "upstream");
    execFileSync(
      "git",
      [
        "diff",
        "--no-index",
        "--no-prefix",
        "--stat",
        "--patch",
        "--",
        `ours/${name}`,
        `upstream/${name}`,
      ],
      {
        cwd: temp,
        encoding: "utf8",
      },
    );
    return "";
  } catch (error) {
    // git diff --no-index exits with 1 when the folders differ.
    if (error && typeof error === "object" && "stdout" in error) return String(error.stdout);
    throw error;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

export type UpdateResult = {
  skill: string;
  upstreamChanged: boolean;
  modified: boolean;
  applied: boolean;
  diff: string;
};

/**
 * Compares a skill with its source. With `apply`, takes the upstream version,
 * unless our copy changed since the last import: then only `force` does.
 */
export async function updateSkill(
  root: string,
  name: string,
  options: { apply?: boolean; force?: boolean } = {},
) {
  const skill = findSkill(root, name);
  if (!skill.provenance)
    throw new SkillError(`${name} has no source: record one with opai skills source.`);
  const folder = join(root, skill.folder);
  const fetched = await fetchSource(skill.provenance.source);
  try {
    const upstream = digest(fetched.folder);
    const result: UpdateResult = {
      skill: name,
      upstreamChanged: upstream !== skill.provenance.upstream,
      modified: skill.modified,
      applied: false,
      diff: diff(folder, fetched.folder, name),
    };
    if (!options.apply || !result.upstreamChanged) return result;
    if (skill.modified && !options.force) {
      throw new SkillError(
        `${name} changed here since its last import: merge the diff by hand, or pass --force to drop the local changes.`,
      );
    }
    const keep = readFileSync(join(folder, SOURCE_FILE), "utf8");
    rmSync(folder, { recursive: true });
    cpSync(fetched.folder, folder, {
      recursive: true,
      dereference: true,
      filter: (path) => basename(path) !== ".git" && basename(path) !== SOURCE_FILE,
    });
    if (frontMatter(readFileSync(join(folder, "SKILL.md"), "utf8"))?.name !== name)
      setName(folder, name);
    writeFileSync(join(folder, SOURCE_FILE), keep);
    writeProvenance(folder, {
      ...skill.provenance,
      revision: fetched.revision,
      upstream,
      local: digest(folder),
      updatedAt: today(),
    });
    link(root);
    result.applied = true;
    return result;
  } finally {
    rmSync(fetched.cleanup, { recursive: true, force: true });
  }
}

// --- Create, move, remove ----------------------------------------------------

export function newSkill(
  root: string,
  name: string,
  options: { space?: string; description?: string } = {},
) {
  if (!NAME.test(name) || name.length > 64) {
    throw new SkillError(`${name}: a name is lowercase letters, digits and hyphens, 64 at most.`);
  }
  const space = options.space ?? baseSpace(root);
  checkSpace(root, space);
  taken(root, name);
  const folder = join(skillsFolder(root, space), name);
  mkdirSync(folder, { recursive: true });
  const description = options.description ?? "TODO: what it does, and when to use it.";
  writeFileSync(
    join(folder, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${name}\n`,
  );
  link(root);
  return readSkill(root, space, name);
}

export function moveSkill(root: string, name: string, space: string) {
  const skill = findSkill(root, name);
  checkSpace(root, space);
  if (skill.space === space) return skill;
  const target = join(skillsFolder(root, space), name);
  mkdirSync(dirname(target), { recursive: true });
  renameSync(join(root, skill.folder), target);
  tidy(root, skill.space);
  link(root);
  return readSkill(root, space, name);
}

/** Removes an empty spaces/<space>/skills folder. */
function tidy(root: string, space: string) {
  const folder = skillsFolder(root, space);
  if (existsSync(folder) && readdirSync(folder).every((name) => name === ".DS_Store")) {
    rmSync(folder, { recursive: true });
  }
}

export function removeSkill(root: string, name: string) {
  const skill = findSkill(root, name);
  rmSync(join(root, skill.folder), { recursive: true });
  tidy(root, skill.space);
  link(root);
  return skill;
}

// --- The app -----------------------------------------------------------------

export type SkillDetail = Skill & {
  /** SKILL.md, and a hash of it for saveSkill. */
  markdown: string;
  hash: string;
  /** The skill's other files, from its folder. */
  files: string[];
};

function hashOf(text: string) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export function skillDetail(root: string, name: string): SkillDetail {
  const skill = findSkill(root, name);
  const folder = join(root, skill.folder);
  const markdown = readFileSync(join(folder, "SKILL.md"), "utf8");
  return {
    ...skill,
    markdown,
    hash: hashOf(markdown),
    files: files(folder).filter((path) => path !== "SKILL.md"),
  };
}

/** Replaces a SKILL.md, if nobody changed it since `baseHash`, then relinks. */
export function saveSkill(root: string, name: string, markdown: string, baseHash: string) {
  const skill = findSkill(root, name);
  const file = join(root, skill.folder, "SKILL.md");
  if (hashOf(readFileSync(file, "utf8")) !== baseHash) {
    throw new SkillError(`${skill.folder}/SKILL.md changed on disk since you opened it.`);
  }
  const meta = frontMatter(markdown);
  if (!meta) throw new SkillError("A SKILL.md starts with front matter (name, description).");
  if (meta.name !== name) {
    throw new SkillError(`The name stays ${name}; rename with opai skills new and remove.`);
  }
  writeFileSync(file, markdown);
  link(root);
  return skillDetail(root, name);
}

export type SkillSettings = {
  description?: string | undefined;
  explicitOnly?: boolean | undefined;
};

/**
 * Changes a skill's description or invocation in its front matter, keeping the
 * other keys and the body as they are, then relinks (Codex's policy follows).
 */
export function configureSkill(
  root: string,
  name: string,
  settings: SkillSettings,
  baseHash: string,
) {
  const skill = findSkill(root, name);
  const file = join(root, skill.folder, "SKILL.md");
  const text = readFileSync(file, "utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text);
  if (!match) throw new SkillError("A SKILL.md starts with front matter (name, description).");
  const doc = parseDocument(match[1]!);
  if (settings.description !== undefined) {
    const description = settings.description.trim();
    if (!description) throw new SkillError("A skill needs a description.");
    doc.set("description", description);
  }
  if (settings.explicitOnly === true) doc.set("disable-model-invocation", true);
  if (settings.explicitOnly === false) doc.delete("disable-model-invocation");
  const head = doc.toString({ lineWidth: 0 }).trimEnd();
  const markdown = `---\n${head}\n---${match[2]}${text.slice(match[0].length)}`;
  return saveSkill(root, name, markdown, baseHash);
}
