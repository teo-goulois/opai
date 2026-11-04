// The procedures behind the app's Spaces, Rules and Config pages. They read
// and edit the user's own files, so mcp.ts does not offer them to agents.

import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import { z } from "zod";

import type { InventoryError, Refused, StaleWrite } from "../files.ts";
import {
  getHarnessFile,
  getHarnessLayout,
  HarnessPath,
  updateHarnessFile,
  type HarnessFileNotFound,
} from "../harness.ts";
import { o } from "../procedure.ts";
import { getRule, listRules, RuleId, updateRule, type RuleNotFound } from "../rules.ts";
import { getSpace, listSpaces, SpaceName, type SpaceNotFound } from "../space-view.ts";

type Failure =
  | InventoryError
  | StaleWrite
  | Refused
  | RuleNotFound
  | SpaceNotFound
  | HarnessFileNotFound;

function toORPCError(error: Failure) {
  switch (error._tag) {
    case "StaleWrite":
      return new ORPCError("CONFLICT", {
        message: `${error.path} changed on disk since you opened it.`,
      });
    case "Refused":
      return new ORPCError(error.reason === "conflict" ? "CONFLICT" : "FORBIDDEN", {
        message: error.message,
      });
    case "RuleNotFound":
      return new ORPCError("NOT_FOUND", { message: `No rule file with id ${error.id}.` });
    case "SpaceNotFound":
      return new ORPCError("NOT_FOUND", { message: `No space named ${error.name}.` });
    case "HarnessFileNotFound":
      return new ORPCError("NOT_FOUND", { message: `No file at ${error.path}.` });
    case "InventoryError":
      return new ORPCError("INTERNAL_SERVER_ERROR", {
        message: `Could not read ${error.path}.`,
        cause: error.cause,
      });
  }
}

function run<A>(program: Effect.Effect<A, Failure>) {
  return Effect.runPromise(program.pipe(Effect.catch((error) => Effect.die(toORPCError(error)))));
}

const readOnly = { readOnlyHint: true, idempotentHint: true };
const replacesFile = { readOnlyHint: false, destructiveHint: true, idempotentHint: true };

/** An edit: the whole new text, and the hash of the version it started from. */
const Edit = { baseHash: z.string().min(1) };

export const workspaceRouter = {
  spaces: {
    list: o
      .meta({
        mcp: {
          tool: "spaces_list",
          description:
            "Every space of the instance: the folders it claims, the modules it turns off, and how many rule files, facts, journal entries and issues it holds.",
          annotations: readOnly,
        },
      })
      .handler(({ context }) => run(listSpaces(context.root))),
    get: o
      .meta({
        mcp: {
          tool: "spaces_get",
          description:
            "One space: its setup, its rule files, the user's memory in it, and what agents recorded there (journal, issues).",
          annotations: readOnly,
        },
      })
      .input(z.object({ name: SpaceName }))
      .handler(({ context, input }) => run(getSpace(context.root, input.name))),
  },

  rules: {
    list: o
      .meta({
        mcp: {
          tool: "rules_list",
          description:
            "The rule files of the instance: each space's AGENTS.md and modules, and the repository's own AGENTS.md and CLAUDE.md.",
          annotations: readOnly,
        },
      })
      .handler(({ context }) => run(listRules(context.root))),
    get: o
      .meta({
        mcp: {
          tool: "rules_get",
          description: "One rule file, with its Markdown and a hash for rules_update.",
          annotations: readOnly,
        },
      })
      .input(z.object({ id: RuleId }))
      .handler(({ context, input }) => run(getRule(context.root, input.id))),
    update: o
      .meta({
        mcp: {
          tool: "rules_update",
          description: "Replace one rule file. Pass the hash from rules_get; a stale hash fails.",
          annotations: replacesFile,
        },
      })
      .input(z.object({ id: RuleId, markdown: z.string().max(500_000), ...Edit }))
      .handler(({ context, input }) =>
        run(updateRule(context.root, input.id, input.markdown, input.baseHash)),
      ),
  },

  harness: {
    layout: o
      .meta({
        mcp: {
          tool: "harness_layout",
          description:
            "What Claude Code and Codex read in claude/ and codex/: settings files, the links of their instructions, and the skills.",
          annotations: readOnly,
        },
      })
      .handler(({ context }) => run(getHarnessLayout(context.root))),
    file: o
      .meta({
        mcp: {
          tool: "harness_file_get",
          description:
            "Read one settings file or skill of claude/ or codex/, with a hash for harness_file_update. A settings file not created yet reads as empty.",
          annotations: readOnly,
        },
      })
      .input(z.object({ path: HarnessPath }))
      .handler(({ context, input }) => run(getHarnessFile(context.root, input.path))),
    updateFile: o
      .meta({
        mcp: {
          tool: "harness_file_update",
          description:
            "Replace one settings file or skill of claude/ or codex/, creating a settings file if needed. Pass the hash from harness_file_get; JSON files must be valid.",
          annotations: replacesFile,
        },
      })
      .input(z.object({ path: HarnessPath, text: z.string().max(500_000), ...Edit }))
      .handler(({ context, input }) =>
        run(updateHarnessFile(context.root, input.path, input.text, input.baseHash)),
      ),
  },
};
