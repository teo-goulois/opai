// The procedures behind the app's Sessions page: the sessions Claude Code and
// Codex recorded, and the skill uses kept in Git. Sessions hold whole
// conversations and tool outputs, so mcp.ts never offers these to agents.

import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import { z } from "zod";

import { o } from "../procedure.ts";
import {
  getSession,
  getSubagent,
  listSessions,
  SessionId,
  type SessionNotFound,
  type SessionsUnreadable,
} from "../sessions.ts";
import { countSkillUses, type UsageUnreadable } from "../usage.ts";

type Failure = SessionNotFound | SessionsUnreadable | UsageUnreadable;

function run<A>(program: Effect.Effect<A, Failure>) {
  return Effect.runPromise(
    program.pipe(
      Effect.catch((error) =>
        Effect.die(
          error._tag === "SessionNotFound"
            ? new ORPCError("NOT_FOUND", { message: `No session ${error.id}.` })
            : new ORPCError("INTERNAL_SERVER_ERROR", {
                message: `Could not read ${error.path}.`,
                cause: error.cause,
              }),
        ),
      ),
    ),
  );
}

export const sessionsRouter = {
  list: o
    .input(z.object({ cursor: z.string().max(200).optional() }))
    .handler(({ context, input }) => run(listSessions(context.root, input.cursor))),
  get: o
    .input(z.object({ id: SessionId }))
    .handler(({ context, input }) => run(getSession(context.root, input.id))),
  subagent: o
    .input(z.object({ id: SessionId, agent: SessionId }))
    .handler(({ context, input }) => run(getSubagent(context.root, input.id, input.agent))),
  skillUses: o.handler(({ context }) => run(countSkillUses(context.root))),
};
