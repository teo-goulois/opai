// What every procedure shares: its context, and how it is offered to agents.

import { os } from "@orpc/server";

import { ROOT } from "./spaces.ts";

export type Context = {
  /** The instance folder. */
  root: string;
  /** The folder the caller works in: the session's folder for the MCP server. */
  cwd: string;
  /** The MCP client that calls, such as claude-code or codex. */
  agent?: string | undefined;
};

export function createContext(): Context {
  return { root: ROOT, cwd: process.cwd() };
}

/**
 * How a procedure is offered to agents. mcp.ts registers only the procedures
 * it lists, and they must declare this.
 */
export type ProcedureMeta = {
  mcp?: {
    tool: string;
    description: string;
    annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
  };
};

export const o = os.$context<Context>().$meta<ProcedureMeta>({});
