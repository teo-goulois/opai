// Whether each skill reaches the other machines of the instance. `opai sync`
// pushes the instance to origin/main every 10 minutes, but it commits only what
// agents wrote (spaces/*/agents/): a skill reaches the other machines once it is
// committed, here, with shareSkill, or with shareAll, which commits the MCP
// servers too.
//
// A skill is its folder plus the links Claude Code and Codex read
// (claude/skills/<name>, codex/skills/<name>): all of them have to be shared.

import { execFileSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { join, relative } from "node:path";

import { listSkills, SkillError, type Skill } from "./skills.ts";
import { loadSpaces } from "./spaces.ts";

/**
 * - local: never committed, so on this machine only.
 * - changed: committed, with changes not committed yet.
 * - pending: committed, not pushed yet: the next sync sends it.
 * - shared: on origin/main as it is here.
 */
export type Sharing = "local" | "changed" | "pending" | "shared";

const REMOTE = "origin/main";

function git(top: string, args: string[]) {
  return execFileSync("git", ["-C", top, ...args], {
    encoding: "utf8",
    timeout: 10_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function tryGit(top: string, args: string[]) {
  try {
    return git(top, args);
  } catch {
    return undefined;
  }
}

/** The top of the instance's repository, when it has one. */
function topOf(root: string) {
  try {
    return execFileSync("git", ["-C", root, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

/** A skill's paths in the repository, from its top: its folder, then its links. */
function pathsOf(root: string, top: string, skill: Skill) {
  return [
    skill.folder,
    join("claude", "skills", skill.name),
    join("codex", "skills", skill.name),
  ].map((path) => relative(top, join(root, path)));
}

function exists(path: string) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

const NUL = (out: string | undefined) => (out ?? "").split("\0").filter(Boolean);

/** Paths of `git status --porcelain -z`; a rename gives both of its paths. */
function changedPaths(out: string | undefined) {
  return NUL(out).map((entry) => (/^[ !?ACDMRTU]{2} /.test(entry) ? entry.slice(3) : entry));
}

const under = (paths: string[], files: Set<string> | string[]) =>
  [...files].some((file) => paths.some((path) => file === path || file.startsWith(`${path}/`)));

/**
 * The sharing of each skill, by its folder. Undefined when the instance has no
 * Git repository or no origin/main to share through.
 */
export function skillSharing(root: string, skills = listSkills(root)) {
  const top = topOf(root);
  if (!top || tryGit(top, ["rev-parse", "--verify", "-q", `${REMOTE}^{commit}`]) === undefined) {
    return undefined;
  }
  const paths = new Map(skills.map((skill) => [skill.folder, pathsOf(root, top, skill)]));
  const scope = [...new Set([...paths.values()].flat())];
  if (scope.length === 0) return new Map<string, Sharing>();

  // A fresh repository has no HEAD: then nothing is committed.
  const committed = new Set(
    NUL(tryGit(top, ["ls-tree", "-r", "-z", "--name-only", "HEAD", "--", ...scope])),
  );
  const changed = changedPaths(
    tryGit(top, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ...scope]),
  );
  // What HEAD has that origin/main does not, not what it lacks from origin/main.
  const outgoing = NUL(
    tryGit(top, ["diff", "--name-only", "-z", `${REMOTE}...HEAD`, "--", ...scope]),
  );

  const sharing = new Map<string, Sharing>();
  for (const [folder, own] of paths) {
    sharing.set(
      folder,
      !under([own[0]!], committed)
        ? "local"
        : under(own, changed)
          ? "changed"
          : under(own, outgoing)
            ? "pending"
            : "shared",
    );
  }
  return sharing;
}

/**
 * Commits these paths and nothing else: anything else staged stays out. Says
 * why when it fails, and leaves them unstaged.
 */
function commit(top: string, paths: string[], message: string[]) {
  try {
    git(top, ["add", "-A", "--", ...paths]);
    git(top, ["commit", "-q", ...message.flatMap((part) => ["-m", part]), "--", ...paths]);
    return undefined;
  } catch (error) {
    tryGit(top, ["reset", "-q", "--", ...paths]);
    const detail =
      error && typeof error === "object" && "stderr" in error ? String(error.stderr).trim() : "";
    return `a secret found by the pre-commit hook, or a Git error.${detail ? ` ${detail}` : ""}`;
  }
}

/**
 * Commits a skill (its folder and its links) and nothing else, for the next
 * sync to push. Anything else staged stays out of the commit.
 */
export function shareSkill(root: string, name: string) {
  const skill = listSkills(root).find((item) => item.name === name);
  if (!skill) throw new SkillError(`No skill named ${name}.`);
  const top = topOf(root);
  if (!top) throw new SkillError("The instance is not a Git repository.");
  // The paths that exist, or that Git has and that are gone: a link it deletes.
  const tracked = NUL(tryGit(top, ["ls-files", "-z", "--", ...pathsOf(root, top, skill)]));
  const own = pathsOf(root, top, skill).filter(
    (path) => exists(join(top, path)) || under([path], tracked),
  );
  const state = skillSharing(root, [skill])?.get(skill.folder);
  if (state !== "local" && state !== "changed") {
    throw new SkillError(`${name} has nothing to share.`);
  }
  const failed = commit(top, own, [`Share the ${name} skill`]);
  if (failed) throw new SkillError(`Could not commit ${name}: ${failed}`);
  return { name, sharing: skillSharing(root, [skill])?.get(skill.folder) ?? "pending" };
}

/**
 * Commits every change to the MCP servers and the skills (each space's
 * mcp.json and skills, and the skill links) and nothing else, for the next
 * sync to push. Returns the paths it committed.
 */
export function shareAll(root: string) {
  const top = topOf(root);
  if (!top) throw new Error("The instance is not a Git repository.");
  const scope = [
    ...loadSpaces(root).flatMap((space) => [
      join("spaces", space.name, "mcp.json"),
      join("spaces", space.name, "skills"),
    ]),
    join("claude", "skills"),
    join("codex", "skills"),
  ].map((path) => relative(top, join(root, path)));
  const paths = changedPaths(
    tryGit(top, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ...scope]),
  );
  if (paths.length === 0) return [];
  const failed = commit(top, paths, ["Share MCP servers and skills", paths.join("\n")]);
  if (failed) throw new Error(`Could not commit the MCP servers and skills: ${failed}`);
  return paths;
}
