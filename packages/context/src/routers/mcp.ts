// The procedures behind the app's MCP page. They change the user's servers and
// write secrets to Infisical, so mcp.ts never offers them to agents. A secret's
// value goes in, never out: the page only learns which names are stored.

import { basename } from "node:path";

import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { parsePaste } from "../mcp-paste.ts";
import { readSecrets, storeSecrets, variables, infisicalEnv } from "../mcp-secrets.ts";
import {
  addServer,
  checkServers,
  claudeServer,
  codexServer,
  findToolServers,
  forgetToolServers,
  importServers,
  McpError,
  moveServer,
  removeProjectServer,
  removeServer,
  type Server,
} from "../mcp-servers.ts";
import {
  canSignIn,
  describeRecord,
  loginState,
  records,
  signOut,
  startLogin,
} from "../mcp-oauth.ts";
import { allServers, cachedStatus, forgetStatus } from "../mcp-status.ts";
import { o } from "../procedure.ts";
import { homePath, loadSpaces } from "../spaces.ts";

const Name = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/, "A server name")
  .max(64);
const Space = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "A space name");
const Variable = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "A variable name");

/** An McpError as the HTTP error it means. */
function rethrow(error: unknown): never {
  if (!(error instanceof McpError)) throw error;
  const code = /^no (server|space) named/.test(error.message)
    ? "NOT_FOUND"
    : /already in/.test(error.message)
      ? "CONFLICT"
      : "BAD_REQUEST";
  throw new ORPCError(code, { message: error.message });
}

function run<A>(work: () => A) {
  try {
    return work();
  } catch (error) {
    rethrow(error);
  }
}

export type SecretState = "infisical" | "environment" | "missing";

/** What Infisical holds; empty, with the reason, when it can't be read. Values stay here. */
function stored(root: string): { values: Record<string, string>; error?: string | undefined } {
  if (!infisicalEnv(root)) return { values: {}, error: "no Infisical project" };
  try {
    return { values: readSecrets(root) };
  } catch (error) {
    return { values: {}, error: (error as Error).message };
  }
}

/** What a server reaches: Codex lacks SSE. */
function reach(server: Server) {
  const codex = codexServer(server);
  return {
    claude: true,
    codex: !!codex,
    claudeOnly: server.type === "sse" ? ["SSE"] : [],
    transport: claudeServer(server).type!,
  };
}

/** A paste as the page shows it: the secrets by name, their values left out. */
function preview(text: string, name?: string) {
  return parsePaste(text, name).map((item) => ({
    name: item.name,
    server: item.server,
    secrets: Object.keys(item.secrets),
    notes: item.notes,
    ...reach(item.server),
  }));
}

export const mcpRouter = {
  list: o.handler(({ context }) => {
    const { values, error } = stored(context.root);
    const names = new Set(Object.keys(values));
    const signIns = records(values);
    const state = (name: string): SecretState =>
      names.has(name) ? "infisical" : process.env[name] ? "environment" : "missing";
    const servers = allServers(context.root).map((entry) => {
      const signIn = signIns.get(entry.name);
      return {
        ...entry,
        // A project's server is managed in its .mcp.json, in the project's repository.
        projectName: entry.project && basename(entry.project),
        projectPath: entry.project && homePath(entry.project),
        ...reach(entry.server),
        secrets: variables(entry.server).map((name) => ({ name, state: state(name) })),
        canSignIn: canSignIn(entry.server),
        signIn: signIn && signIn.url === entry.server.url ? describeRecord(signIn) : undefined,
      };
    });
    const known = Object.fromEntries([...names].map((name) => [name, "stored"]));
    return {
      servers,
      spaces: loadSpaces(context.root).map((space) => ({ name: space.name, base: space.base })),
      found: findToolServers(context.root).map((found) => ({
        name: found.name,
        where: found.where,
        server: found.server,
        secrets: Object.keys(found.secrets),
      })),
      infisical: { configured: !!infisicalEnv(context.root), error },
      problems: checkServers(context.root, { ...process.env, ...known }),
    };
  }),
  parse: o
    .input(z.object({ text: z.string().max(20_000), name: Name.optional() }))
    .handler(({ input }) => run(() => preview(input.text, input.name))),
  /** Adds what a paste declares: its secrets to Infisical first, then the servers. */
  add: o
    .input(
      z.object({
        text: z.string().max(20_000),
        name: Name.optional(),
        space: Space,
        replace: z.boolean().optional(),
      }),
    )
    .handler(({ context, input }) =>
      run(() => {
        const pasted = parsePaste(input.text, input.name);
        const secrets = Object.assign({}, ...pasted.map((item) => item.secrets));
        storeSecrets(context.root, secrets);
        return pasted.map((item) =>
          addServer(context.root, item.name, item.server, {
            space: input.space,
            replace: input.replace,
          }),
        );
      }),
    ),
  remove: o
    .input(z.object({ name: Name, space: Space }))
    .handler(({ context, input }) =>
      run(() => removeServer(context.root, input.name, input.space)),
    ),
  /** Takes a server out of its project's .mcp.json. */
  removeFromProject: o
    .input(z.object({ name: Name, project: z.string().max(1024) }))
    .handler(({ context, input }) =>
      run(() => {
        const entry = removeProjectServer(context.root, input.name, input.project);
        forgetStatus();
        return { name: entry.name, space: entry.space };
      }),
    ),
  /** Takes servers out of the configs of Claude Code and Codex, wherever they are. */
  forget: o
    .input(z.object({ names: z.array(z.string().max(64)).min(1).max(100) }))
    .handler(({ context, input }) => run(() => forgetToolServers(context.root, input.names))),
  move: o
    .input(z.object({ name: Name, from: Space, to: Space }))
    .handler(({ context, input }) =>
      run(() => moveServer(context.root, input.name, input.to, input.from)),
    ),
  import: o
    .input(z.object({ names: z.array(z.string().max(64)).min(1).max(50), space: Space }))
    .handler(({ context, input }) =>
      run(() => {
        const imported = importServers(context.root, input.names, { space: input.space });
        storeSecrets(
          context.root,
          Object.assign({}, ...imported.map((item) => item.source.secrets)),
        );
        return imported.map(({ name, space }) => ({ name, space }));
      }),
    ),
  /** Whether Claude Code reaches each server: a check under 5 minutes old, or a new one. */
  status: o
    .input(z.object({ refresh: z.boolean().optional() }))
    .handler(({ context, input }) => cachedStatus(context.root, input.refresh)),
  /** Starts a sign-in to a remote server: the page the browser opens. */
  connect: o
    .input(z.object({ name: Name, space: Space, project: z.string().max(1024).optional() }))
    .handler(({ context, input }) =>
      startLogin(context.root, input.name, {
        space: input.space,
        ...(input.project && { project: input.project }),
      }).catch(rethrow),
    ),
  /** Where the sign-in started by connect stands. */
  connection: o
    .input(z.object({ name: Name }))
    .handler(({ input }) => loginState(input.name) ?? null),
  /** Forgets Opai's sign-in to a server, on every machine. */
  signOut: o.input(z.object({ name: Name })).handler(({ context, input }) =>
    run(() => {
      signOut(context.root, input.name);
      return { name: input.name };
    }),
  ),
  setSecret: o
    .input(z.object({ name: Variable, value: z.string().min(1).max(20_000) }))
    .handler(({ context, input }) =>
      run(() => {
        storeSecrets(context.root, { [input.name]: input.value });
        forgetStatus();
        return { name: input.name };
      }),
    ),
};
