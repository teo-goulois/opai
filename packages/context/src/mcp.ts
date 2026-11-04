// The context layer as an MCP server over stdio. Claude Code and Codex start it
// per session, in the session's folder.
//
// Only the procedures in `exposed` become tools: a new procedure stays private
// until someone adds it here. The writing tools only create files in
// spaces/<space>/agents/, for the space of the session's folder.
//
// oRPC has an MCP adapter only in its 2.0 beta (@orpc/mcp); replace this
// bridge with it once it is stable.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { call, ORPCError, type AnyProcedure } from "@orpc/server";
import type { z } from "zod";

import type { Context, ProcedureMeta } from "./procedure.ts";
import { contextRouter as router } from "./routers/context.ts";
import { ROOT } from "./spaces.ts";

export const exposed: AnyProcedure[] = [
  router.space.current,
  router.memory.search,
  router.memory.get,
  router.journal.append,
  router.issues.record,
];

function message(error: unknown) {
  if (error instanceof ORPCError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

export function createServer(context: Context) {
  const server = new McpServer({ name: "opai", version: "0.1.0" });
  for (const procedure of exposed) {
    const definition = procedure["~orpc"];
    const meta = (definition.meta as ProcedureMeta).mcp;
    if (!meta) throw new Error("An exposed procedure has no mcp metadata.");
    server.registerTool(
      meta.tool,
      {
        description: meta.description,
        // Every procedure input is a zod object, which the SDK takes as is.
        inputSchema: definition.inputSchema as z.ZodObject,
        annotations: meta.annotations,
      },
      async (input: unknown) => {
        try {
          const agent = server.server.getClientVersion()?.name;
          const output = await call(procedure, input, { context: { ...context, agent } });
          return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
        } catch (error) {
          return { isError: true, content: [{ type: "text", text: message(error) }] };
        }
      },
    );
  }
  return server;
}

if (import.meta.main) {
  await createServer({ root: ROOT, cwd: process.cwd() }).connect(new StdioServerTransport());
}
