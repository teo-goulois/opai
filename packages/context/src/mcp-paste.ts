// Reads an MCP server from what a provider's docs say to paste: a `claude mcp
// add` or `codex mcp add` command, JSON (.mcp.json, a "servers" map, or one
// server), a command such as `npx -y @acme/mcp`, or a URL. Literal secrets
// come out as ${NAME}, with their values apart, for Infisical.

import { McpError, portable, serverProblems, type Server } from "./mcp-servers.ts";

export type Pasted = {
  name: string;
  server: Server;
  /** Values taken out of the server, by the variable that replaces them. */
  secrets: Record<string, string>;
  /** What the paste held that mcp.json does not keep. */
  notes: string[];
};

/** Shell words: quotes, backslashes and line continuations, as a shell reads them. */
export function words(text: string): string[] {
  const result: string[] = [];
  let word: string | undefined;
  let quote: string | undefined;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quote) {
      if (char === quote) quote = undefined;
      else if (char === "\\" && quote === '"' && /["\\$`]/.test(text[i + 1] ?? "")) {
        word += text[++i]!;
      } else word += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      word ??= "";
    } else if (char === "\\") {
      const next = text[++i];
      if (next === "\n") continue;
      if (next !== undefined) word = (word ?? "") + next;
    } else if (/\s/.test(char)) {
      if (word !== undefined) result.push(word);
      word = undefined;
    } else word = (word ?? "") + char;
  }
  if (quote) throw new McpError("an unclosed quote");
  if (word !== undefined) result.push(word);
  return result;
}

/** A name from a package or a URL: @stripe/mcp → stripe, mcp.sentry.dev → sentry. */
export function guessName(target: string) {
  let base = target;
  try {
    const url = new URL(target);
    const parts = url.hostname.split(".").filter((part) => !/^(mcp|api|www|app)$/.test(part));
    base = parts.length > 1 ? parts.at(-2)! : (parts[0] ?? url.hostname);
  } catch {
    const scoped = /^@([^/]+)\/(.+)$/.exec(target);
    base = scoped
      ? /^(mcp|server|mcp-server)$/.test(scoped[2]!.replace(/@.*$/, ""))
        ? scoped[1]!
        : scoped[2]!
      : target.split("/").at(-1)!;
    base = base.replace(/@[^@]*$/, "").replace(/\.(m?js|py)$/, "");
  }
  const name = base
    .replace(/^(mcp-server-|server-|mcp-)/, "")
    .replace(/(-mcp-server|-mcp|-server)$/, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return name || "server";
}

const RUNNERS = new Set([
  "npx",
  "uvx",
  "bunx",
  "pnpx",
  "pipx",
  "docker",
  "deno",
  "node",
  "python",
  "python3",
]);

/** The package or script a command runs, to name its server. */
function commandTarget(command: string, args: string[]) {
  if (!RUNNERS.has(command)) return command;
  return args.find((arg) => !arg.startsWith("-") && arg !== "run" && arg !== "dlx") ?? command;
}

type Draft = { name?: string | undefined; server: Server; notes: string[] };

function env(value: string, label: string): [string, string] {
  const at = value.indexOf("=");
  if (at <= 0) throw new McpError(`${label} ${value}: expected NAME=value`);
  return [value.slice(0, at), value.slice(at + 1)];
}

function header(value: string): [string, string] {
  const at = value.indexOf(":");
  if (at <= 0) throw new McpError(`header ${value}: expected Name: value`);
  return [value.slice(0, at).trim(), value.slice(at + 1).trim()];
}

/** `claude mcp add [options] <name> <commandOrUrl> [args...]` */
function claudeAdd(tokens: string[]): Draft {
  const notes: string[] = [];
  const positionals: string[] = [];
  const server: Server = {};
  let transport: string | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token === "--") {
      positionals.push(...tokens.slice(i + 1));
      break;
    }
    // After a command, everything is its argument; after a URL, options go on.
    if (positionals.length >= 2 && !/^https?:\/\//.test(positionals[1]!)) {
      positionals.push(token);
      continue;
    }
    const [flag, inline] = token.startsWith("--") ? token.split(/=(.*)/s) : [token];
    const value = () => inline ?? tokens[++i] ?? "";
    switch (flag) {
      case "-t":
      case "--transport":
        transport = value();
        break;
      case "-s":
      case "--scope":
        value();
        notes.push("its scope: the space decides where it applies");
        break;
      case "-e":
      case "--env": {
        const [key, val] = env(value(), "--env");
        server.env = { ...server.env, [key]: val };
        // Claude's -e takes several NAME=value in a row.
        while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i + 1] ?? "") && positionals.length < 2) {
          const [k, v] = env(tokens[++i]!, "--env");
          server.env[k] = v;
        }
        break;
      }
      case "-H":
      case "--header": {
        const [key, val] = header(value());
        server.headers = { ...server.headers, [key]: val };
        break;
      }
      case "--client-id":
      case "--client-secret":
      case "--callback-port":
        value();
        notes.push(`${flag}: sign in with /mcp instead`);
        break;
      default:
        if (token.startsWith("-") && positionals.length === 0) {
          notes.push(`${token} is not kept`);
        } else positionals.push(token);
    }
  }
  const [name, target, ...args] = positionals;
  if (!name || !target) throw new McpError("claude mcp add needs a name and a command or URL");
  if (transport === "http" || transport === "sse" || /^https?:\/\//.test(target)) {
    server.url = target;
    if (transport === "sse") server.type = "sse";
  } else {
    server.command = target;
    if (args.length > 0) server.args = args;
  }
  return { name, server, notes };
}

/** `codex mcp add <name> [--env K=V]... [--url U] [--bearer-token-env-var X] [-- command args]` */
function codexAdd(tokens: string[]): Draft {
  const notes: string[] = [];
  const server: Server = {};
  let name: string | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token === "--") {
      const [command, ...args] = tokens.slice(i + 1);
      if (command) server.command = command;
      if (args.length > 0) server.args = args;
      break;
    }
    const [flag, inline] = token.startsWith("--") ? token.split(/=(.*)/s) : [token];
    const value = () => inline ?? tokens[++i] ?? "";
    switch (flag) {
      case "--env": {
        const [key, val] = env(value(), "--env");
        server.env = { ...server.env, [key]: val };
        break;
      }
      case "--url":
        server.url = value();
        break;
      case "--bearer-token-env-var":
        server.headers = { ...server.headers, Authorization: `Bearer \${${value()}}` };
        break;
      default:
        if (token.startsWith("-")) notes.push(`${token} is not kept`);
        else name ??= token;
    }
  }
  if (!name) throw new McpError("codex mcp add needs a name");
  return { name, server, notes };
}

const SERVER_KEYS = new Set([
  "type",
  "command",
  "args",
  "env",
  "cwd",
  "url",
  "headers",
  "headersHelper",
]);

function fromJson(name: string | undefined, raw: unknown): Draft {
  if (!raw || typeof raw !== "object")
    throw new McpError(`${name ?? "the server"} is not an object`);
  const server: Record<string, unknown> = {};
  const notes: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (SERVER_KEYS.has(key)) server[key] = value;
    else if (key === "serverUrl" || key === "httpUrl") server.url = value;
    else notes.push(`${key} is not kept`);
  }
  if (server.type === "streamable-http" || server.type === "streamableHttp") server.type = "http";
  if (server.type === "stdio" || (server.type === "http" && server.url)) delete server.type;
  return { name, server: server as Server, notes };
}

function parseJson(text: string): Draft[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new McpError(`not JSON: ${(error as Error).message}`);
  }
  const record = data as Record<string, unknown>;
  const map =
    record.mcpServers ?? record.servers ?? (record.mcp as Record<string, unknown>)?.servers;
  if (map && typeof map === "object") {
    return Object.entries(map).map(([name, raw]) => fromJson(name, raw));
  }
  if ("command" in record || "url" in record || "serverUrl" in record)
    return [fromJson(undefined, record)];
  // A map of servers without its wrapper, as a provider's snippet often shows it.
  return Object.entries(record).map(([name, raw]) => fromJson(name, raw));
}

function parseDrafts(text: string): Draft[] {
  const trimmed = text.trim();
  if (!trimmed) throw new McpError("nothing to read");
  if (trimmed.startsWith("{")) return parseJson(trimmed);
  const tokens = words(trimmed.replace(/^\$\s+/, ""));
  const [tool, sub, verb, ...rest] = tokens;
  if ((tool === "claude" || tool === "codex") && sub === "mcp") {
    if (tool === "claude" && verb === "add-json") {
      const [name, json] = rest.filter((token) => !token.startsWith("-") && token !== "user");
      if (!name || !json) throw new McpError("claude mcp add-json needs a name and JSON");
      return [{ ...parseJson(json)[0]!, name }];
    }
    if (verb !== "add") throw new McpError(`${tool} mcp ${verb ?? ""} does not add a server`);
    return [tool === "claude" ? claudeAdd(rest) : codexAdd(rest)];
  }
  if (/^https?:\/\//.test(tokens[0]!)) return [{ server: { url: tokens[0]! }, notes: [] }];
  const [command, ...args] = tokens;
  return [{ server: { command: command!, ...(args.length > 0 && { args }) }, notes: [] }];
}

/**
 * The servers a paste declares. `name` names a lone server, and wins over the
 * one the paste gives; without either, the name comes from the package or URL.
 */
export function parsePaste(text: string, name?: string): Pasted[] {
  const drafts = parseDrafts(text);
  return drafts.map((draft) => {
    const chosen =
      (drafts.length === 1 && name) ||
      draft.name ||
      guessName(
        draft.server.url ?? commandTarget(draft.server.command ?? "", draft.server.args ?? []),
      );
    const clean = chosen.replace(/[^A-Za-z0-9_-]+/g, "-");
    const { server, secrets } = portable(clean, draft.server);
    const problems = serverProblems(clean, server);
    if (problems.length > 0) throw new McpError(`${clean}: ${problems.join("; ")}`);
    return { name: clean, server, secrets, notes: draft.notes };
  });
}
