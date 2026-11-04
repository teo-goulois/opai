import { readlink } from "node:fs/promises";
import { join, relative, resolve, dirname } from "node:path";

import { Data, Effect } from "effect";
import { z } from "zod";

import {
  createText,
  hashText,
  isLink,
  listFolders,
  readOptionalText,
  Refused,
  StaleWrite,
  writeText,
} from "./files.ts";
import { homePath } from "./spaces.ts";

// What each tool reads in its own folder, claude/ or codex/: settings, hooks,
// skills. Their instructions are links to spaces/global/AGENTS.md, edited as a
// rule. A missing settings file is normal: it reads as empty, and the first
// save creates it.

export type Tool = "claude" | "codex";

type Language = "markdown" | "json" | "toml";

/** The settings files the app reads and writes, by tool. */
const FILES: { tool: Tool; path: string; language: Language }[] = [
  { tool: "claude", path: "claude/settings.json", language: "json" },
  { tool: "codex", path: "codex/config.toml", language: "toml" },
  { tool: "codex", path: "codex/hooks.json", language: "json" },
];

const INSTRUCTIONS: { tool: Tool; path: string }[] = [
  { tool: "claude", path: "claude/CLAUDE.md" },
  { tool: "codex", path: "codex/AGENTS.md" },
];

/** Skills the tools install and update themselves; not mine to edit. */
const MANAGED = new Set(["synced", ".system"]);

const SKILL_FOLDERS: { tool: Tool; path: string }[] = [
  { tool: "claude", path: "claude/skills" },
  { tool: "codex", path: "codex/skills" },
];

/** A file the app may open: a settings file, or a skill's SKILL.md. */
export const HarnessPath = z
  .string()
  .regex(
    /^(claude\/settings\.json|codex\/config\.toml|codex\/hooks\.json|(claude|codex)\/skills\/[a-z0-9][a-z0-9_-]*\/SKILL\.md)$/,
    "A settings file or a skill of claude/ or codex/",
  );

export type HarnessFileSummary = {
  tool: Tool;
  path: string;
  exists: boolean;
  /** Missing, or only whitespace. */
  empty: boolean;
};

export type HarnessInstructions = {
  tool: Tool;
  path: string;
  /** Where the link points, from the root, such as spaces/global/AGENTS.md. */
  target: string | null;
};

export type HarnessSkillFolder = {
  tool: Tool;
  path: string;
  skills: { name: string; path: string; hasSkillMd: boolean }[];
};

export type HarnessLayout = {
  /** The instance folder, from ~ when inside it. */
  root: string;
  files: HarnessFileSummary[];
  instructions: HarnessInstructions[];
  skillFolders: HarnessSkillFolder[];
};

export type HarnessFile = {
  /** The instance folder, from ~ when inside it. */
  root: string;
  path: string;
  language: Language;
  exists: boolean;
  text: string;
  hash: string;
};

export class HarnessFileNotFound extends Data.TaggedError("HarnessFileNotFound")<{
  path: string;
}> {}

const languageOf = (path: string) =>
  FILES.find((file) => file.path === path)?.language ?? "markdown";

const linkTarget = (root: string, path: string) =>
  Effect.gen(function* () {
    const absolute = join(root, path);
    if (!(yield* isLink(absolute))) return null;
    const target = yield* Effect.promise(() => readlink(absolute));
    return relative(root, resolve(dirname(absolute), target));
  });

export const getHarnessLayout = (root: string) =>
  Effect.gen(function* () {
    const files = yield* Effect.forEach(FILES, (file) =>
      readOptionalText(join(root, file.path)).pipe(
        Effect.map((text): HarnessFileSummary => ({
          tool: file.tool,
          path: file.path,
          exists: text !== undefined,
          empty: (text ?? "").trim() === "",
        })),
      ),
    );
    const instructions = yield* Effect.forEach(INSTRUCTIONS, (file) =>
      linkTarget(root, file.path).pipe(Effect.map((target) => ({ ...file, target }))),
    );
    const skillFolders = yield* Effect.forEach(SKILL_FOLDERS, (folder) =>
      Effect.gen(function* () {
        const absolute = join(root, folder.path);
        const names = (yield* listFolders(absolute)).filter((name) => !MANAGED.has(name));
        const skills = yield* Effect.forEach(names, (name) =>
          readOptionalText(join(absolute, name, "SKILL.md")).pipe(
            Effect.map((text) => ({
              name,
              path: `${folder.path}/${name}/SKILL.md`,
              hasSkillMd: text !== undefined,
            })),
          ),
        );
        return { tool: folder.tool, path: folder.path, skills };
      }),
    );
    return { root: homePath(root), files, instructions, skillFolders } satisfies HarnessLayout;
  });

export const getHarnessFile = (root: string, path: string) =>
  Effect.gen(function* () {
    const text = yield* readOptionalText(join(root, path));
    // A skill must exist; a settings file may not yet.
    if (text === undefined && path.includes("/skills/")) {
      return yield* new HarnessFileNotFound({ path });
    }
    const value = text ?? "";
    return {
      root: homePath(root),
      path,
      language: languageOf(path),
      exists: text !== undefined,
      text: value,
      hash: hashText(value),
    } satisfies HarnessFile;
  });

export const updateHarnessFile = (root: string, path: string, text: string, baseHash: string) =>
  Effect.gen(function* () {
    const current = yield* getHarnessFile(root, path);
    if (current.hash !== baseHash) return yield* new StaleWrite({ path });
    if (current.language === "json" && text.trim() !== "") {
      try {
        JSON.parse(text);
      } catch (error) {
        return yield* new Refused({
          reason: "forbidden",
          message: `${path} is not valid JSON: ${error instanceof Error ? error.message : error}`,
        });
      }
    }
    const absolute = join(root, path);
    if (current.exists) yield* writeText(absolute, text);
    else if (text !== "") yield* createText(absolute, text, path);
    return yield* getHarnessFile(root, path);
  });
