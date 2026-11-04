// The procedures behind the app's Automations page. They read this machine and
// others, edit the registry, and change automations, so mcp.ts does not offer
// them to agents.

import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import { z } from "zod";

import {
  archiveCodex,
  controlAgent,
  getAutomations,
  getCodexFile,
  getRegistry,
  readMachine,
  setCodexStatus,
  updateCodexFile,
  updateRegistry,
  type AutomationInvalid,
  type AutomationNotFound,
  type MachineUnreachable,
  type RegistryNotFound,
} from "../automations.ts";
import type { InventoryError, Refused, StaleWrite } from "../files.ts";
import { o } from "../procedure.ts";
import { SpaceName } from "../space-view.ts";

type Failure =
  | RegistryNotFound
  | AutomationNotFound
  | AutomationInvalid
  | MachineUnreachable
  | StaleWrite
  | Refused
  | InventoryError;

function toORPCError(error: Failure) {
  switch (error._tag) {
    case "RegistryNotFound":
      return new ORPCError("NOT_FOUND", {
        message: `The space ${error.space} has no context/ops.md.`,
      });
    case "AutomationNotFound":
      return new ORPCError("NOT_FOUND", {
        message: `No automation Opai may change: ${error.target}.`,
      });
    case "AutomationInvalid":
      return new ORPCError("BAD_REQUEST", { message: error.message });
    case "MachineUnreachable":
      return new ORPCError("BAD_GATEWAY", { message: `${error.machine}: ${error.message}` });
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

const FilePath = z.string().min(1).max(1024);

export const automationsRouter = {
  list: o.handler(({ context }) => Effect.runPromise(getAutomations(context.root))),

  machine: o
    .input(z.object({ name: z.string().min(1).max(100) }))
    .handler(({ context, input }) => run(readMachine(context.root, input.name))),

  registry: o
    .input(z.object({ space: SpaceName }))
    .handler(({ context, input }) => run(getRegistry(context.root, input.space))),

  updateRegistry: o
    .input(z.object({ space: SpaceName, markdown: z.string().max(500_000), baseHash: z.string() }))
    .handler(({ context, input }) =>
      run(updateRegistry(context.root, input.space, input.markdown, input.baseHash)),
    ),

  codexFile: o
    .input(z.object({ path: FilePath }))
    .handler(({ context, input }) => run(getCodexFile(context.root, input.path))),

  updateCodexFile: o
    .input(z.object({ path: FilePath, text: z.string().max(500_000), baseHash: z.string() }))
    .handler(({ context, input }) =>
      run(updateCodexFile(context.root, input.path, input.text, input.baseHash)),
    ),

  codexStatus: o
    .input(z.object({ path: FilePath, status: z.enum(["active", "paused"]) }))
    .handler(({ context, input }) => run(setCodexStatus(context.root, input.path, input.status))),

  archiveCodex: o
    .input(z.object({ path: FilePath }))
    .handler(({ context, input }) => run(archiveCodex(context.root, input.path))),

  agent: o
    .input(
      z.object({
        label: z.string().min(1).max(300),
        action: z.enum(["stop", "start", "restart"]),
      }),
    )
    .handler(({ context, input }) => run(controlAgent(context.root, input.label, input.action))),
};
