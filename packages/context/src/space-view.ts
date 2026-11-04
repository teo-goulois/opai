// What the app shows of the spaces: how each one is set up, the user's memory in
// it, and what agents recorded there. Read-only.

import { join, relative } from "node:path";

import { Data, Effect } from "effect";
import { z } from "zod";

import { listFolders, listRegularFiles, readOptionalText } from "./files.ts";
import { splitFrontmatter } from "./markdown/document.ts";
import { listRules, type RuleSummary } from "./rules.ts";
import { homePath, loadSpaces, spaceFolders, type Space } from "./spaces.ts";

export class SpaceNotFound extends Data.TaggedError("SpaceNotFound")<{ name: string }> {}

export const SpaceName = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "A space name");

export type SpaceConfig = {
  name: string;
  base: boolean;
  default: boolean;
  /** The folders it claims, with `~`. */
  paths: string[];
  disable: string[];
};

export type SpaceSummary = SpaceConfig & {
  counts: { rules: number; facts: number; journal: number; issues: number };
};

export type Fact = { path: string; title: string };

export type JournalEntry = {
  path: string;
  title: string;
  project: string;
  status: string;
  relevance: string;
  agent: string;
  machine: string;
  date: string;
  body: string;
};

export type IssueEntry = {
  path: string;
  title: string;
  key: string;
  scope: string;
  agent: string;
  machine: string;
  date: string;
  /** How many issue files, in every space, carry the same key. */
  occurrences: number;
  body: string;
};

export type SpaceDetail = SpaceSummary & {
  ruleFiles: RuleSummary[];
  facts: Fact[];
  journal: JournalEntry[];
  issues: IssueEntry[];
};

function configOf(space: Space): SpaceConfig {
  return {
    name: space.name,
    base: space.base,
    default: space.default,
    paths: space.paths.map(homePath),
    disable: space.disable,
  };
}

function text(value: unknown) {
  return typeof value === "string" ? value : value === undefined ? "" : String(value);
}

function titleOf(body: string, fallback: string) {
  const heading = body.split("\n").find((line) => line.startsWith("# "));
  return heading ? heading.slice(2).trim() : fallback;
}

/** The body without its H1, which the app shows as the title. */
function withoutTitle(body: string) {
  return body.replace(/^\s*#\s+.+\r?\n/, "").trim();
}

/**
 * Markdown files under `folder`, one level of subfolders deep (journal days).
 * Links are left out, as in the MCP server: a link could point anywhere.
 */
const markdownFiles = (folder: string, nested: boolean) =>
  Effect.gen(function* () {
    if (!nested) {
      return (yield* listRegularFiles(folder))
        .filter((name) => name.endsWith(".md") && name !== "README.md")
        .map((name) => join(folder, name));
    }
    const files: string[] = [];
    for (const day of yield* listFolders(folder)) {
      for (const name of yield* listRegularFiles(join(folder, day))) {
        if (name.endsWith(".md")) files.push(join(folder, day, name));
      }
    }
    return files;
  });

const readEntries = (root: string, folder: string, nested: boolean) =>
  Effect.gen(function* () {
    const entries: { path: string; frontmatter: Record<string, unknown>; body: string }[] = [];
    for (const file of yield* markdownFiles(folder, nested)) {
      const markdown = yield* readOptionalText(file);
      if (markdown === undefined) continue;
      entries.push({ path: relative(root, file), ...splitFrontmatter(markdown) });
    }
    return entries;
  });

const readFacts = (root: string, name: string) =>
  readEntries(root, spaceFolders(root, name).memory, false).pipe(
    Effect.map((entries) =>
      entries.map((entry) => ({ path: entry.path, title: titleOf(entry.body, entry.path) })),
    ),
  );

const readJournal = (root: string, name: string) =>
  readEntries(root, join(spaceFolders(root, name).agents, "journal"), true).pipe(
    Effect.map((entries) =>
      entries
        .map(({ path, frontmatter, body }): JournalEntry => ({
          path,
          title: titleOf(body, path),
          project: text(frontmatter.project),
          status: text(frontmatter.status),
          relevance: text(frontmatter.relevance),
          agent: text(frontmatter.agent),
          machine: text(frontmatter.machine),
          date: text(frontmatter.date),
          body: withoutTitle(body),
        }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    ),
  );

type IssueFile = {
  space: string;
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
};

/** Every issue of every space, to count the occurrences of a key. */
const readAllIssues = (root: string, spaces: Space[]) =>
  Effect.forEach(spaces, (space) =>
    readEntries(root, join(spaceFolders(root, space.name).agents, "issues"), false).pipe(
      Effect.map((entries) => entries.map((entry) => ({ space: space.name, ...entry }))),
    ),
  ).pipe(Effect.map((all): IssueFile[] => all.flat()));

function issuesOf(name: string, all: IssueFile[]) {
  const counts = new Map<string, number>();
  for (const issue of all) {
    const key = text(issue.frontmatter.key);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return all
    .filter((issue) => issue.space === name)
    .map(({ path, frontmatter, body }): IssueEntry => {
      const key = text(frontmatter.key);
      return {
        path,
        title: titleOf(body, path),
        key,
        scope: text(frontmatter.scope),
        agent: text(frontmatter.agent),
        machine: text(frontmatter.machine),
        date: text(frontmatter.date),
        occurrences: counts.get(key) ?? 1,
        body: withoutTitle(body),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export const listSpaces = (root: string) =>
  Effect.gen(function* () {
    const spaces = loadSpaces(root);
    const rules = yield* listRules(root);
    const issues = yield* readAllIssues(root, spaces);
    return yield* Effect.forEach(spaces, (space) =>
      Effect.gen(function* () {
        return {
          ...configOf(space),
          counts: {
            rules: rules.filter((rule) => rule.space === space.name).length,
            facts: (yield* readFacts(root, space.name)).length,
            journal: (yield* readJournal(root, space.name)).length,
            issues: issues.filter((issue) => issue.space === space.name).length,
          },
        } satisfies SpaceSummary;
      }),
    );
  });

export const getSpace = (root: string, name: string) =>
  Effect.gen(function* () {
    const spaces = loadSpaces(root);
    const space = spaces.find((candidate) => candidate.name === name);
    if (!space) return yield* new SpaceNotFound({ name });
    const ruleFiles = (yield* listRules(root)).filter((rule) => rule.space === name);
    const facts = yield* readFacts(root, name);
    const journal = yield* readJournal(root, name);
    const issues = issuesOf(name, yield* readAllIssues(root, spaces));
    return {
      ...configOf(space),
      counts: {
        rules: ruleFiles.length,
        facts: facts.length,
        journal: journal.length,
        issues: issues.length,
      },
      ruleFiles,
      facts,
      journal,
      issues,
    } satisfies SpaceDetail;
  });
