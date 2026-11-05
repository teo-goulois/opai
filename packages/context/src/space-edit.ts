// Creating, changing and archiving spaces: what `opai spaces` and the app's
// space settings do. A change rewrites only its own lines of space.yaml, so
// comments and other keys stay. The session hook reads space.yaml at each
// start: a change applies from the next session.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, sep } from "node:path";

import { link } from "./skills.ts";
import { homePath, loadSpaces, readYaml, real, which, type Space } from "./spaces.ts";

export class SpaceError extends Error {}

const NAME = /^[a-z0-9][a-z0-9-]*$/;

function spaceFile(root: string, name: string) {
  return join(root, "spaces", name, "space.yaml");
}

function find(root: string, name: string) {
  const space = loadSpaces(root).find((candidate) => candidate.name === name);
  if (!space) throw new SpaceError(`No space named ${name}.`);
  return space;
}

/** A folder as typed (~/code, /abs): absolute and real, as loadSpaces reads it; or an error. */
function absolute(folder: string) {
  const trimmed = folder.trim().replace(/\/+$/, "");
  const path =
    trimmed === "~" || trimmed.startsWith("~/") ? join(homedir(), trimmed.slice(1)) : trimmed;
  if (!path || !isAbsolute(path)) {
    throw new SpaceError(`A folder starts with / or ~/: ${folder}.`);
  }
  return real(path);
}

/** One line of text as a YAML scalar, quoted when YAML would read it otherwise. */
function scalar(text: string) {
  const line = text.replace(/\s+/g, " ").trim();
  if (!/[:#"'{}[\],&*!|>%@`]|^[-?]|^(true|false|null|~)$/i.test(line)) return line;
  if (!line.includes('"')) return `"${line}"`;
  if (!line.includes("'")) return `'${line}'`;
  throw new SpaceError("A description holds either double or single quotes, not both.");
}

/**
 * Replaces the lines of `key` in a space.yaml (its line and the indented ones
 * under it) with `block`, or removes them when `block` is empty. A new key
 * goes after `after` when that key is there, else at the end.
 */
function setKey(text: string, key: string, block: string[], after?: string) {
  const lines = text.replace(/\n+$/, "").split("\n");
  const at = (name: string) => lines.findIndex((line) => new RegExp(`^${name}\\s*:`).test(line));
  const start = at(key);
  if (start !== -1) {
    let end = start + 1;
    while (end < lines.length && /^\s+\S/.test(lines[end]!)) end++;
    lines.splice(start, end - start, ...block);
  } else if (block.length > 0) {
    const anchor = after ? at(after) : -1;
    if (anchor === -1) lines.push(...block);
    else lines.splice(anchor + 1, 0, ...block);
  }
  return `${lines.join("\n")}\n`;
}

function listBlock(key: string, items: string[]) {
  return items.length > 0 ? [`${key}:`, ...items.map((item) => `  - ${scalar(item)}`)] : [];
}

/** Claims of other spaces that the given folders would duplicate. */
function claimedElsewhere(root: string, name: string, folders: string[]) {
  for (const space of loadSpaces(root)) {
    if (space.name === name) continue;
    for (const folder of folders) {
      if (space.paths.includes(folder)) {
        throw new SpaceError(
          `${homePath(folder)} is already a folder of ${space.name}: remove it there first.`,
        );
      }
    }
  }
}

function writeFolders(root: string, name: string, folders: string[]) {
  const resolved = [...new Set(folders.map(absolute))];
  claimedElsewhere(root, name, resolved);
  return resolved.map(homePath);
}

/** A new space: its space.yaml with a description and the folders it claims. */
export function createSpace(
  root: string,
  name: string,
  options: { description?: string | undefined; paths?: string[] | undefined } = {},
): Space {
  if (!NAME.test(name) || name.length > 64) {
    throw new SpaceError(
      "A space name is lowercase letters, digits and dashes, starting with a letter or a digit.",
    );
  }
  if (existsSync(join(root, "spaces", name))) {
    throw new SpaceError(`A space named ${name} already exists.`);
  }
  const paths = writeFolders(root, name, options.paths ?? []);
  const description = options.description?.trim();
  const lines = [
    `name: ${name}`,
    ...(description ? [`description: ${scalar(description)}`] : []),
    ...listBlock("paths", paths),
  ];
  mkdirSync(join(root, "spaces", name), { recursive: true });
  writeFileSync(spaceFile(root, name), `${lines.join("\n")}\n`);
  return find(root, name);
}

export type SpaceChanges = {
  description?: string | undefined;
  /** Every folder it claims, replacing the current list. */
  paths?: string[] | undefined;
  /** true makes it the default space, in place of the current one. */
  makeDefault?: boolean | undefined;
};

/** Changes the description, the folders, or which space is the default one. */
export function updateSpace(root: string, name: string, changes: SpaceChanges): Space {
  const space = find(root, name);
  const file = spaceFile(root, name);
  let text = readFileSync(file, "utf8");
  if (changes.description !== undefined) {
    const description = changes.description.trim();
    text = setKey(
      text,
      "description",
      description ? [`description: ${scalar(description)}`] : [],
      "name",
    );
  }
  if (changes.paths !== undefined) {
    if (space.base) throw new SpaceError(`${name} is the base space: it applies everywhere.`);
    text = setKey(text, "paths", listBlock("paths", writeFolders(root, name, changes.paths)));
  }
  if (changes.makeDefault && !space.default) {
    if (space.base) throw new SpaceError(`${name} is the base space: it cannot be the default.`);
    for (const other of loadSpaces(root).filter((candidate) => candidate.default)) {
      const otherFile = spaceFile(root, other.name);
      writeFileSync(otherFile, setKey(readFileSync(otherFile, "utf8"), "default", []));
    }
    text = setKey(text, "default", ["default: true"], "description");
  }
  writeFileSync(file, text);
  return find(root, name);
}

/**
 * Turns a global module on or off in a space: rewrites the `disable` list of
 * its space.yaml.
 */
export function setModule(root: string, name: string, module: string, enabled: boolean) {
  find(root, name);
  const file = spaceFile(root, name);
  const text = readFileSync(file, "utf8");
  const current = readYaml(text).disable;
  const list = (Array.isArray(current) ? current : []).filter((item) => item !== module);
  writeFileSync(
    file,
    setKey(text, "disable", listBlock("disable", enabled ? list : [...list, module])),
  );
}

/**
 * Moves a space's folder, its rules, notes, skills and records, to
 * .local/archive/spaces/ of the instance, then drops its skills' links. The
 * base and the default space stay: another space must be the default first.
 * Move the folder back to restore it.
 */
export function archiveSpace(root: string, name: string) {
  const space = find(root, name);
  if (space.base) throw new SpaceError(`${name} is the base space: it cannot be archived.`);
  if (space.default) {
    throw new SpaceError(`${name} is the default space: make another one the default first.`);
  }
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  const archive = join(root, ".local", "archive", "spaces");
  const target = join(archive, `${name}-${stamp}`);
  mkdirSync(archive, { recursive: true });
  renameSync(join(root, "spaces", name), target);
  link(root);
  return homePath(target);
}

export type FolderClaim = {
  /** The folder, with ~. */
  folder: string;
  exists: boolean;
  /** The space its sessions get today, and the claim that gives it (none: the default). */
  now: { space: string; path: string | undefined } | undefined;
  /** Another space claims this very folder: it cannot be claimed twice. */
  taken: string | undefined;
  /** Folders inside it that other spaces claim: they stay theirs, the longest path wins. */
  inside: { space: string; path: string }[];
};

/** What claiming a folder would change, before the space claims it. */
export function previewFolder(root: string, name: string, folder: string): FolderClaim {
  const path = absolute(folder);
  const spaces = loadSpaces(root);
  const match = which(root, path, spaces);
  const others = spaces.filter((space) => space.name !== name);
  return {
    folder: homePath(path),
    exists: existsSync(path),
    now: match ? { space: match.space.name, path: match.path && homePath(match.path) } : undefined,
    taken: others.find((space) => space.paths.includes(path))?.name,
    inside: others.flatMap((space) =>
      space.paths
        .filter((claim) => claim !== path && claim.startsWith(path + sep))
        .map((claim) => ({ space: space.name, path: homePath(claim) })),
    ),
  };
}
