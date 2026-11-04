// The procedures behind the app's Automations page. They read this machine's
// automations and edit the registry, so mcp.ts does not offer them to agents.

import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import { z } from "zod";

import {
  getAutomations,
  getRegistry,
  updateRegistry,
  type RegistryNotFound,
} from "../automations.ts";
import type { InventoryError, Refused, StaleWrite } from "../files.ts";
import { o } from "../procedure.ts";
import { SpaceName } from "../space-view.ts";

type Failure = RegistryNotFound | StaleWrite | Refused | InventoryError;

function toORPCError(error: Failure) {
  switch (error._tag) {
    case "RegistryNotFound":
      return new ORPCError("NOT_FOUND", {
        message: `The space ${error.space} has no context/ops.md.`,
      });
    case "StaleWrite":
      return new ORPCError("CONFLICT", {
        message: `${error.path} changed on disk since you opened it.`,
      });
    case "Refused":
      return new ORPCError(error.reason === "conflict" ? "CONFLICT" : "FORBIDDEN", {
        message: error.message,
      });
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

export const automationsRouter = {
  list: o.handler(({ context }) => Effect.runPromise(getAutomations(context.root))),

  registry: o
    .input(z.object({ space: SpaceName }))
    .handler(({ context, input }) => run(getRegistry(context.root, input.space))),

  updateRegistry: o
    .input(z.object({ space: SpaceName, markdown: z.string().max(500_000), baseHash: z.string() }))
    .handler(({ context, input }) =>
      run(updateRegistry(context.root, input.space, input.markdown, input.baseHash)),
    ),
};
