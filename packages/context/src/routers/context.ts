// The procedures of the context layer: spaces, memory, and what agents record.
// Each one declares how it is offered to agents; mcp.ts registers only the
// ones it lists.

import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import { z } from "zod";

import {
  getMemory,
  searchMemory,
  type MemoryNotFound,
  type OutsideMemory,
  type ReadFailed,
} from "../memory.ts";
import {
  appendJournal,
  author,
  recordIssue,
  type SecretSuspected,
  type WriteFailed,
} from "../records.ts";
import { o } from "../procedure.ts";
import { homePath, spaceFolders, spaceRules, which } from "../spaces.ts";

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true };
const createsFile = { readOnlyHint: false, destructiveHint: false, idempotentHint: false };

const Folder = z
  .string()
  .min(1)
  .max(1024)
  .optional()
  .describe("Absolute path of the folder the work is in. Defaults to the session's folder.");

type Failure = MemoryNotFound | OutsideMemory | ReadFailed | WriteFailed | SecretSuspected;

function run<A>(program: Effect.Effect<A, Failure>) {
  return Effect.runPromise(
    program.pipe(
      Effect.catchTag("MemoryNotFound", (error) =>
        Effect.die(new ORPCError("NOT_FOUND", { message: `No fact at ${error.path}.` })),
      ),
      Effect.catchTag("OutsideMemory", (error) =>
        Effect.die(
          new ORPCError("FORBIDDEN", {
            message: `${error.path} is not a fact: give a path that memory_search returned.`,
          }),
        ),
      ),
      Effect.catchTag("ReadFailed", (error) =>
        Effect.die(
          new ORPCError("INTERNAL_SERVER_ERROR", { message: `Could not read ${error.path}.` }),
        ),
      ),
      Effect.catchTag("WriteFailed", (error) =>
        Effect.die(
          new ORPCError("INTERNAL_SERVER_ERROR", { message: `Could not write ${error.path}.` }),
        ),
      ),
      Effect.catchTag("SecretSuspected", (error) =>
        Effect.die(
          new ORPCError("BAD_REQUEST", {
            message: `${error.field} looks like it holds a secret. Remove it; nothing was written.`,
          }),
        ),
      ),
    ),
  );
}

/** The space of a folder, or a clear error when no space exists at all. */
function spaceOf(root: string, folder: string) {
  const match = which(root, folder);
  if (!match)
    throw new ORPCError("NOT_FOUND", { message: "No space is defined in the instance (spaces/)." });
  return match;
}

const Text = (max: number) => z.string().trim().min(1).max(max);
const List = z.array(Text(500)).max(30).optional();

export const contextRouter = {
  space: {
    current: o
      .meta({
        mcp: {
          tool: "space_current",
          description:
            "The space a folder belongs to (global, personal, a company, a client...), with that space's rules and " +
            "where its notes and your records live. Call it when the work moves to another project.",
          annotations: readOnly,
        },
      })
      .input(z.object({ cwd: Folder }))
      .handler(({ input, context }) => {
        const folder = input.cwd ?? context.cwd;
        const { space, path } = spaceOf(context.root, folder);
        const folders = spaceFolders(context.root, space.name);
        return {
          space: space.name,
          folder: homePath(folder),
          folderFrom: input.cwd ? "input" : "session",
          claimedBy: path ? homePath(path) : null,
          disabledModules: space.disable,
          rules: spaceRules(context.root, space) ?? null,
          notes: homePath(folders.context),
          records: homePath(folders.agents),
        };
      }),
  },
  memory: {
    search: o
      .meta({
        mcp: {
          tool: "memory_search",
          description:
            "Search the user's memory, durable facts they validated, in the current space and the global one. " +
            "Returns the matching facts best first; read one with memory_get.",
          annotations: readOnly,
        },
      })
      .input(
        z.object({
          query: z.string().min(1).max(200).describe("Words to look for, in any language."),
          cwd: Folder,
          limit: z.number().int().min(1).max(20).default(5),
        }),
      )
      .handler(({ input, context }) => {
        const { space } = spaceOf(context.root, input.cwd ?? context.cwd);
        return run(searchMemory(context.root, space.name, input.query, input.limit)).then(
          (facts) => ({
            space: space.name,
            facts,
          }),
        );
      }),
    get: o
      .meta({
        mcp: {
          tool: "memory_get",
          description: "Read one fact of the user's memory, by the path memory_search returned.",
          annotations: readOnly,
        },
      })
      .input(z.object({ path: z.string().min(1).max(1024) }))
      .handler(({ input, context }) => run(getMemory(context.root, input.path))),
  },
  journal: {
    append: o
      .meta({
        mcp: {
          tool: "journal_append",
          description:
            "Record a task in the user's AI journal, in the space of this session. Use at the end of a " +
            "non-trivial task with a concrete outcome; skip trivial questions, tiny edits, and " +
            "conversations with no result. Never include secrets, credentials, private customer data, " +
            "or transcripts. Each call creates a new entry; nothing is ever overwritten.",
          annotations: createsFile,
        },
      })
      .input(
        z.object({
          project: Text(80).describe("The project the work was in, such as billing or website."),
          title: Text(120).describe("The task, in a few words."),
          status: z
            .enum(["implemented", "validated", "blocked", "planned"])
            .describe(
              "implemented: the change exists, runtime proof may be separate. validated: the outcome " +
                "was checked with evidence. blocked: a concrete blocker stopped it. planned: a proposal, " +
                "not verified.",
            ),
          relevance: z
            .enum(["S", "A", "B", "C", "D"])
            .describe(
              "Against the user's daily progress, not effort. S major, A important milestone, B meaningful " +
                "progress, C small local improvement, D routine. It never upgrades the status.",
            ),
          relevanceReason: Text(300),
          outcome: Text(4000).describe("What concretely changed or was learned."),
          objective: Text(1000).optional(),
          validation: Text(2000).optional().describe("How the outcome was checked."),
          changes: List.describe("Files, services, or settings changed."),
          decisions: List,
          blockers: Text(1000).optional(),
          next: Text(1000).optional(),
          publicSharing: Text(1000)
            .optional()
            .describe(
              "Only non-sensitive facts that could support a public update. Omit when there are none.",
            ),
        }),
      )
      .handler(({ input, context }) => {
        const { space } = spaceOf(context.root, context.cwd);
        return run(appendJournal(context.root, space.name, input, author(context.agent)));
      }),
  },
  issues: {
    record: o
      .meta({
        mcp: {
          tool: "issue_record",
          description:
            "Record one occurrence of a problem the user reported about your work (behavior, reasoning, " +
            "output, workflow), or a convention they had to correct or repeat, in the space of this " +
            "session. Not for ordinary product bugs. Never merges with earlier occurrences. When the " +
            "answer counts 3 or more occurrences of the key, tell the user and propose a precise change to " +
            "the relevant AGENTS.md. Never include secrets or transcripts.",
          annotations: createsFile,
        },
      })
      .input(
        z.object({
          key: Text(60).describe(
            "Stable kebab-case recurrence key for the failure, reused across occurrences.",
          ),
          title: Text(120),
          context: Text(2000).describe("Where it happened: project, task, files when known."),
          wrong: Text(2000).describe("What went wrong."),
          expected: Text(2000).describe("What the user expected."),
          scope: z
            .enum(["global", "project"])
            .describe("Whether the lesson belongs in the global rules or a project's AGENTS.md."),
          prevention: Text(2000).optional().describe("An instruction that would prevent it."),
          project: Text(80).optional(),
        }),
      )
      .handler(({ input, context }) => {
        const { space } = spaceOf(context.root, context.cwd);
        return run(recordIssue(context.root, space.name, input, author(context.agent)));
      }),
  },
};
