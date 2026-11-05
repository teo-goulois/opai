// The procedures behind the app's MCP page. They change the user's servers and
// write secrets to Infisical, so mcp.ts never offers them to agents. A secret's
// value goes in, never out: the page only learns which names are stored.

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
  importServers,
  listServers,
  McpError,
  moveServer,
  removeServer,
  type Server,
} from "../mcp-servers.ts";
import { o } from "../procedure.ts";
import { loadSpaces } from "../spaces.ts";

const Name = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/, "A server name")
  .max(64);
const Space = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "A space name");
const Variable = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "A variable name");

function run<A>(work: () => A) {
  try {
    return work();
  } catch (error) {
    if (!(error instanceof McpError)) throw error;
    const code = /^no (server|space) named/.test(error.message)
      ? "NOT_FOUND"
      : /already in/.test(error.message)
        ? "CONFLICT"
        : "BAD_REQUEST";
    throw new ORPCError(code, { message: error.message });
  }
}

export type SecretState = "infisical" | "environment" | "missing";

/** The names Infisical holds; undefined, with the reason, when it can't be read. */
function stored(root: string): { names: Set<string>; error?: string | undefined } {
  if (!infisicalEnv(root)) return { names: new Set(), error: "no Infisical project" };
  try {
    return { names: new Set(Object.keys(readSecrets(root))) };
  } catch (error) {
    return { names: new Set(), error: (error as Error).message };
  }
}

/** What a server reaches: Codex lacks SSE and headersHelper. */
function reach(server: Server) {
  const codex = codexServer(server);
  return {
    claude: true,
    codex: !!codex,
    claudeOnly: [
      ...(server.type === "sse" ? ["SSE"] : []),
      ...(server.headersHelper ? ["headersHelper"] : []),
    ],
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
    const { names, error } = stored(context.root);
    const state = (name: string): SecretState =>
      names.has(name) ? "infisical" : process.env[name] ? "environment" : "missing";
    const servers = listServers(context.root).map((entry) => ({
      ...entry,
      ...reach(entry.server),
      secrets: variables(entry.server).map((name) => ({ name, state: state(name) })),
    }));
    const declared = new Set(servers.map((entry) => entry.name));
    const known = Object.fromEntries([...names].map((name) => [name, "stored"]));
    return {
      servers,
      spaces: loadSpaces(context.root).map((space) => ({ name: space.name, base: space.base })),
      found: findToolServers(context.root).map((found) => ({
        name: found.name,
        where: found.where,
        server: found.server,
        secrets: Object.keys(found.secrets),
        declared: declared.has(found.name),
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
  setSecret: o
    .input(z.object({ name: Variable, value: z.string().min(1).max(20_000) }))
    .handler(({ context, input }) =>
      run(() => {
        storeSecrets(context.root, { [input.name]: input.value });
        return { name: input.name };
      }),
    ),
};
