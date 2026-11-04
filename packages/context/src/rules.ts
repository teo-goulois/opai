import { join } from "node:path";

import { Data, Effect } from "effect";
import { z } from "zod";

import {
  hashText,
  listFileNames,
  listFolders,
  readOptionalText,
  readText,
  StaleWrite,
  writeText,
} from "./files.ts";
import { homePath } from "./spaces.ts";
import { lead, outline, plainText, type Heading } from "./markdown/document.ts";

// The rules of the instance, readable and editable:
// - spaces/<space>/AGENTS.md: the rules of a space. global's are the rules for
//   every project, linked as claude/CLAUDE.md and codex/AGENTS.md; another
//   space's are given to the agent by the session hook.
// - spaces/<space>/modules/*.md: optional rules its AGENTS.md points to.
// - AGENTS.md and CLAUDE.md at the root: for agents working in the instance itself.
//   A file that only holds `@OTHER.md` is shown as a pointer.

export class RuleNotFound extends Data.TaggedError("RuleNotFound")<{ id: string }> {}

export const RuleId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Lowercase letters, digits, and hyphens");

export type RuleScope = "space" | "repository";

export type RuleSummary = {
  id: string;
  title: string;
  /** Path relative to the instance root. */
  path: string;
  scope: RuleScope;
  /** The space a rule file belongs to; none for this repository's own files. */
  space?: string;
  /** The first paragraph, as plain text. */
  summary: string;
  /** Level-2 headings: one per rule. */
  sections: Heading[];
  /** Set when the file only imports another one (`@AGENTS.md`). */
  pointsTo?: string;
};

export type RuleDetail = RuleSummary & {
  /** The instance folder, from ~ when inside it. */
  root: string;
  markdown: string;
  /** Hash of `markdown`, sent back with an edit. */
  hash: string;
};

type RuleFile = { id: string; path: string; scope: RuleScope; space?: string };

const repositoryFiles: RuleFile[] = [
  { id: "agents-md", path: "AGENTS.md", scope: "repository" },
  { id: "claude-md", path: "CLAUDE.md", scope: "repository" },
];

const findRuleFiles = (root: string) =>
  Effect.gen(function* () {
    const files: RuleFile[] = [];
    for (const space of yield* listFolders(join(root, "spaces"))) {
      const folder = join("spaces", space);
      files.push({ id: `${space}-agents`, path: join(folder, "AGENTS.md"), scope: "space", space });
      for (const name of yield* listFileNames(join(root, folder, "modules"))) {
        if (!name.endsWith(".md")) continue;
        files.push({
          id: `${space}-module-${name.replace(/\.md$/, "")}`.toLowerCase(),
          path: join(folder, "modules", name),
          scope: "space",
          space,
        });
      }
    }
    return [...files, ...repositoryFiles];
  });

function describe(root: string, file: RuleFile, markdown: string): RuleDetail {
  const headings = outline(markdown);
  const pointer = /^@(\S+\.md)\s*$/.exec(markdown.trim());
  const title = headings.find((heading) => heading.depth === 1)?.title;
  return {
    ...file,
    root: homePath(root),
    title: title ?? file.path,
    summary: pointer ? "" : plainText(lead(markdown)),
    sections: headings.filter((heading) => heading.depth === 2),
    ...(pointer?.[1] ? { pointsTo: pointer[1] } : {}),
    markdown,
    hash: hashText(markdown),
  };
}

const readRules = (root: string) =>
  Effect.gen(function* () {
    const rules: RuleDetail[] = [];
    for (const file of yield* findRuleFiles(root)) {
      const markdown = yield* readOptionalText(join(root, file.path));
      if (markdown !== undefined) rules.push(describe(root, file, markdown));
    }
    return rules;
  });

export const listRules = (root: string) =>
  readRules(root).pipe(
    Effect.map((rules) =>
      rules.map(({ markdown: _markdown, hash: _hash, root: _root, ...summary }) => summary),
    ),
  );

export const getRule = (root: string, id: string) =>
  Effect.gen(function* () {
    const rule = (yield* readRules(root)).find((candidate) => candidate.id === id);
    if (!rule) return yield* new RuleNotFound({ id });
    return rule;
  });

/** Replaces a rule file, if nobody changed it since `baseHash`. */
export const updateRule = (root: string, id: string, markdown: string, baseHash: string) =>
  Effect.gen(function* () {
    const file = (yield* findRuleFiles(root)).find((candidate) => candidate.id === id);
    if (!file) return yield* new RuleNotFound({ id });
    const path = join(root, file.path);
    const current = yield* readText(path);
    if (hashText(current) !== baseHash) return yield* new StaleWrite({ path: file.path });
    yield* writeText(path, markdown);
    return yield* getRule(root, id);
  });
