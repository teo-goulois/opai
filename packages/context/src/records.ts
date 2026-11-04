// What agents write: journal entries and issue occurrences, one new file each
// in spaces/<space>/agents/. Never an existing file, so two agents on two
// machines cannot overwrite each other or conflict in Git.

import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join, relative } from "node:path";

import { Data, Effect } from "effect";

import { spaceFolders } from "./spaces.ts";

export class WriteFailed extends Data.TaggedError("WriteFailed")<{
  path: string;
  cause: unknown;
}> {}

/** The text looks like it holds a secret. */
export class SecretSuspected extends Data.TaggedError("SecretSuspected")<{ field: string }> {}

export type Author = {
  /** The MCP client, such as claude-code or codex. */
  agent: string;
  machine: string;
};

export type JournalEntry = {
  project: string;
  title: string;
  status: "implemented" | "validated" | "blocked" | "planned";
  relevance: "S" | "A" | "B" | "C" | "D";
  relevanceReason: string;
  outcome: string;
  objective?: string | undefined;
  validation?: string | undefined;
  changes?: string[] | undefined;
  decisions?: string[] | undefined;
  blockers?: string | undefined;
  next?: string | undefined;
  publicSharing?: string | undefined;
};

export type Issue = {
  key: string;
  title: string;
  context: string;
  wrong: string;
  expected: string;
  scope: "global" | "project";
  prevention?: string | undefined;
  project?: string | undefined;
};

// Common token shapes. A light guard, not a scanner: the tool descriptions
// already forbid secrets.
const SECRET =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-(?:ant-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|xox[abpr]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.)/;

function checkSecrets(fields: Record<string, unknown>) {
  for (const [field, value] of Object.entries(fields)) {
    const text = Array.isArray(value) ? value.join("\n") : String(value ?? "");
    if (SECRET.test(text)) return Effect.fail(new SecretSuspected({ field }));
  }
  return Effect.void;
}

export function slug(text: string, max = 40) {
  const value = text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/, "");
  return value || "entry";
}

/** Date and time in Europe/Paris, as YYYY-MM-DD and HH-MM-SS. */
export function parisNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}-${parts.minute}-${parts.second}`,
    iso: now.toISOString(),
  };
}

export function author(agent: string | undefined): Author {
  return { agent: agent || "unknown", machine: hostname().replace(/\.local$/, "") };
}

/** YAML front matter; JSON strings are valid YAML scalars. */
function frontMatter(fields: Record<string, string | number>) {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

function section(title: string, body: string | string[] | undefined) {
  if (body === undefined || (Array.isArray(body) && body.length === 0)) return "";
  const text = Array.isArray(body) ? body.map((item) => `- ${item}`).join("\n") : body.trim();
  return `\n## ${title}\n\n${text}\n`;
}

/** Creates a new file; never replaces one. */
const createFile = (path: string, text: string) =>
  Effect.tryPromise({
    try: async () => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, text, { encoding: "utf8", flag: "wx" });
    },
    catch: (cause) => new WriteFailed({ path, cause }),
  });

function shortId() {
  return randomUUID().slice(0, 8);
}

export const appendJournal = (root: string, space: string, entry: JournalEntry, by: Author) =>
  Effect.gen(function* () {
    yield* checkSecrets(entry);
    const now = parisNow();
    const name = `${now.time}-${slug(entry.project, 24)}-${slug(entry.title)}-${shortId()}.md`;
    const file = join(spaceFolders(root, space).agents, "journal", now.day, name);
    const text =
      frontMatter({
        project: entry.project,
        status: entry.status,
        relevance: entry.relevance,
        agent: by.agent,
        machine: by.machine,
        date: now.iso,
      }) +
      `\n# ${entry.title}\n` +
      section("Objective", entry.objective) +
      section("Outcome", entry.outcome) +
      section("Relevance", `${entry.relevance}: ${entry.relevanceReason}`) +
      section("Validation", entry.validation) +
      section("Changes", entry.changes) +
      section("Decisions", entry.decisions) +
      section("Blockers", entry.blockers) +
      section("Next", entry.next) +
      section("Public sharing", entry.publicSharing ?? "None");
    yield* createFile(file, text);
    return { path: relative(root, file), space };
  });

/** How many issue files, in every space, carry this recurrence key. */
const countKey = (root: string, key: string) =>
  Effect.tryPromise({
    try: async () => {
      const spaces = await readdir(join(root, "spaces"), { withFileTypes: true });
      const line = `key: ${JSON.stringify(key)}`;
      let count = 0;
      for (const space of spaces.filter((entry) => entry.isDirectory())) {
        const folder = join(spaceFolders(root, space.name).agents, "issues");
        const files = await readdir(folder).catch(() => [] as string[]);
        for (const file of files.filter((name) => name.endsWith(".md"))) {
          const text = await readFile(join(folder, file), "utf8");
          if (text.split("\n---\n")[0]?.split("\n").includes(line)) count += 1;
        }
      }
      return count;
    },
    catch: (cause) => new WriteFailed({ path: "spaces/*/agents/issues", cause }),
  });

export const recordIssue = (root: string, space: string, issue: Issue, by: Author) =>
  Effect.gen(function* () {
    yield* checkSecrets(issue);
    const key = slug(issue.key, 60);
    const now = parisNow();
    const name = `${now.day}T${now.time}-${key}-${shortId()}.md`;
    const file = join(spaceFolders(root, space).agents, "issues", name);
    const text =
      frontMatter({
        key,
        scope: issue.scope,
        ...(issue.project ? { project: issue.project } : {}),
        agent: by.agent,
        machine: by.machine,
        date: now.iso,
      }) +
      `\n# ${issue.title}\n` +
      section("Context", issue.context) +
      section("What went wrong", issue.wrong) +
      section("Expected", issue.expected) +
      section("Possible prevention", issue.prevention);
    yield* createFile(file, text);
    const occurrences = yield* countKey(root, key);
    return { path: relative(root, file), space, key, occurrences };
  });
