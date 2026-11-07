// MCP servers. Each one is declared in spaces/<space>/mcp.json, in the shape
// of Claude Code's .mcp.json. Those of global are in every session; those of
// another space only in sessions of that space, and they win over a global
// server of the same name. opai passes them when it starts a tool:
//
// - Claude Code: --mcp-config=.local/mcp/<space>.json, written at launch.
// - Codex: one -c mcp_servers.<name>={...} per server, without the SSE
//   servers, which it lacks; a headersHelper becomes its http_headers_helper.
//
// Secrets stay out of mcp.json: a value can hold ${NAME} or ${NAME:-default},
// read from the environment the tool starts in, where opai puts those stored
// in Infisical (mcp-secrets.ts). Give a secret its own name as
// the key ("API_KEY": "${API_KEY}"), or put it in an Authorization header
// ("Bearer ${TOKEN}"): Codex then reads it from the environment too, instead of
// receiving the value in its arguments.
//
// The opai server itself is not here: `opai setup` writes it into the tools'
// own configs, so plain claude and codex have it too.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { parse as parseToml } from "smol-toml";

import { homePath, loadSpaces, which } from "./spaces.ts";

export type Server = {
  type?: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  /** A command that prints headers as JSON; Claude Code only. */
  headersHelper?: string;
};

export type Entry = { name: string; space: string; server: Server };

export class McpError extends Error {}

/** Codex splits -c keys on dots, so a name keeps to these characters. */
const NAME = /^[A-Za-z0-9_-]+$/;
const TEMPLATE = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;
const ONLY_VARIABLE = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;
const BEARER = /^Bearer \$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

/** The servers opai itself configures, never declared in a space. */
const RESERVED = new Set(["opai"]);
/** An env variable or header whose value is a secret. */
const SECRET = /key|token|secret|password|passwd|cookie|authorization/i;

/** The env variables and headers that look secret and hold a value, not a ${NAME}. */
function literalSecrets(server: Server) {
  return Object.entries({ ...server.env, ...server.headers })
    .filter(
      ([key, value]) =>
        SECRET.test(key) && !value.includes("${") && !/^(true|false|\d+)$/i.test(value),
    )
    .map(([key]) => key);
}

// --- Reading ---------------------------------------------------------------

export function mcpFile(root: string, space: string) {
  return join(root, "spaces", space, "mcp.json");
}

function baseSpace(root: string) {
  return loadSpaces(root).find((space) => space.base)?.name ?? "global";
}

function isStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, string> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === "string")
  );
}

/** What is wrong with one server's declaration; empty when it is valid. */
export function serverProblems(name: string, server: unknown): string[] {
  if (!NAME.test(name))
    return [`the name ${name} holds characters other than letters, digits, - and _`];
  if (RESERVED.has(name)) return [`${name} is configured by opai setup, not in a space`];
  if (!server || typeof server !== "object") return ["is not an object"];
  const s = server as Record<string, unknown>;
  const problems: string[] = [];
  if (s.type !== undefined && !["stdio", "http", "sse"].includes(s.type as string)) {
    problems.push(`type ${String(s.type)} is not stdio, http or sse`);
  }
  if ((typeof s.command === "string") === (typeof s.url === "string")) {
    problems.push("needs either a command or a url");
  }
  if (s.args !== undefined && !isStrings(s.args)) problems.push("args is not a list of strings");
  if (s.headersHelper !== undefined && typeof s.headersHelper !== "string") {
    problems.push("headersHelper is not a string");
  }
  for (const key of ["env", "headers"]) {
    if (s[key] !== undefined && !isRecord(s[key])) problems.push(`${key} is not a map of strings`);
  }
  if (problems.length > 0) return problems;
  for (const key of literalSecrets(s as Server)) {
    problems.push(
      `${key} holds a literal value, and mcp.json is committed: write \${NAME} and set NAME in the environment`,
    );
  }
  return problems;
}

function readFile(root: string, space: string): Record<string, Server> {
  const file = mcpFile(root, space);
  if (!existsSync(file)) return {};
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new McpError(`${homePath(file)}: ${(error as Error).message}`);
  }
  const servers = (data as { mcpServers?: unknown } | null)?.mcpServers ?? {};
  if (!servers || typeof servers !== "object") {
    throw new McpError(`${homePath(file)}: mcpServers is not an object`);
  }
  return servers as Record<string, Server>;
}

/** Writes the space's servers; a space left with none loses its mcp.json. */
function writeFile(root: string, space: string, servers: Record<string, Server>) {
  const file = mcpFile(root, space);
  if (Object.keys(servers).length === 0) rmSync(file, { force: true });
  else writeFileSync(file, `${JSON.stringify({ mcpServers: servers }, null, 2)}\n`);
}

/** Every valid server of every space, the base space first. */
export function listServers(root: string): Entry[] {
  const base = baseSpace(root);
  const spaces = loadSpaces(root)
    .map((space) => space.name)
    .sort((a, b) => Number(b === base) - Number(a === base) || a.localeCompare(b));
  return spaces.flatMap((space) => {
    let servers: Record<string, Server>;
    try {
      servers = readFile(root, space);
    } catch {
      return [];
    }
    return Object.entries(servers)
      .filter(([name, server]) => serverProblems(name, server).length === 0)
      .map(([name, server]) => ({ name, space, server }));
  });
}

/** The servers of a session in `cwd`: the base space's, then its space's. */
export function sessionServers(root: string, cwd: string): Record<string, Server> {
  const base = baseSpace(root);
  const space = which(root, cwd)?.space.name;
  const entries = listServers(root);
  // The space's entries come last, so they win over the base space's.
  return Object.fromEntries(
    [
      ...entries.filter((entry) => entry.space === base),
      ...entries.filter((entry) => entry.space === space && space !== base),
    ].map((entry) => [entry.name, entry.server]),
  );
}

// --- Launch ----------------------------------------------------------------

function expand(text: string, env: NodeJS.ProcessEnv) {
  return text.replace(
    TEMPLATE,
    (_, name: string, fallback?: string) => env[name] || fallback || "",
  );
}

/** The server as Claude Code reads it: the type said, the templates left to Claude. */
export function claudeServer(server: Server): Server {
  return { type: server.type ?? (server.url ? "http" : "stdio"), ...server };
}

/**
 * The server as Codex reads it, or undefined for an SSE server (Codex has no
 * SSE transport). Templates are expanded here, except a variable passed under
 * its own name and a bearer token, which Codex reads from the environment.
 */
export function codexServer(server: Server, env = process.env) {
  if (server.type === "sse") return undefined;
  const table: Record<string, unknown> = {};
  if (server.command) {
    table.command = expand(server.command, env);
    if (server.args?.length) table.args = server.args.map((arg) => expand(arg, env));
    if (server.cwd) table.cwd = expand(server.cwd, env);
    const literal: Record<string, string> = {};
    const passed: string[] = [];
    for (const [key, value] of Object.entries(server.env ?? {})) {
      if (ONLY_VARIABLE.exec(value)?.[1] === key) passed.push(key);
      else literal[key] = expand(value, env);
    }
    if (Object.keys(literal).length > 0) table.env = literal;
    if (passed.length > 0) table.env_vars = passed;
    return table;
  }
  table.url = expand(server.url!, env);
  const literal: Record<string, string> = {};
  const fromEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(server.headers ?? {})) {
    const bearer = BEARER.exec(value);
    const variable = ONLY_VARIABLE.exec(value);
    if (key.toLowerCase() === "authorization" && bearer) table.bearer_token_env_var = bearer[1];
    else if (variable) fromEnv[key] = variable[1]!;
    else literal[key] = expand(value, env);
  }
  if (Object.keys(literal).length > 0) table.http_headers = literal;
  if (Object.keys(fromEnv).length > 0) table.env_http_headers = fromEnv;
  if (server.headersHelper) table.http_headers_helper = expand(server.headersHelper, env);
  return table;
}

function tomlKey(key: string) {
  return NAME.test(key) ? key : JSON.stringify(key);
}

/** An inline TOML value, on one line. */
export function inlineToml(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(inlineToml).join(",")}]`;
  if (value && typeof value === "object") {
    const pairs = Object.entries(value).map(([key, item]) => `${tomlKey(key)}=${inlineToml(item)}`);
    return `{${pairs.join(",")}}`;
  }
  return String(value);
}

/** The arguments that bring a session's servers, for `opai claude` and `opai codex`. */
export function mcpLaunchArgs(
  root: string,
  tool: "claude" | "codex",
  cwd: string,
  env = process.env,
  servers = sessionServers(root, cwd),
) {
  const names = Object.keys(servers);
  if (names.length === 0) return [];
  if (tool === "claude") {
    const space = which(root, cwd)?.space.name ?? baseSpace(root);
    const folder = join(root, ".local", "mcp");
    const file = join(folder, `${space}.json`);
    const config = Object.fromEntries(names.map((name) => [name, claudeServer(servers[name]!)]));
    const text = `${JSON.stringify({ mcpServers: config }, null, 2)}\n`;
    mkdirSync(folder, { recursive: true });
    if (!existsSync(file) || readFileSync(file, "utf8") !== text) writeFileSync(file, text);
    // With "=", a prompt that follows is not read as one more config file.
    return [`--mcp-config=${file}`];
  }
  return names.flatMap((name) => {
    const table = codexServer(servers[name]!, env);
    return table ? ["-c", `mcp_servers.${name}=${inlineToml(table)}`] : [];
  });
}

// --- Changes ---------------------------------------------------------------

function spaceNamed(root: string, space: string | undefined) {
  const name = space ?? baseSpace(root);
  if (!loadSpaces(root).some((item) => item.name === name)) {
    throw new McpError(`no space named ${name}`);
  }
  return name;
}

/** The one entry with that name, in `space` when given. */
function find(root: string, name: string, space?: string) {
  const matches = listServers(root).filter(
    (entry) => entry.name === name && (!space || entry.space === space),
  );
  if (matches.length === 0)
    throw new McpError(`no server named ${name}${space ? ` in ${space}` : ""}`);
  if (matches.length > 1) {
    throw new McpError(
      `${name} is in ${matches.map((entry) => entry.space).join(" and ")}: say which with --space`,
    );
  }
  return matches[0]!;
}

export function addServer(
  root: string,
  name: string,
  server: Server,
  options: { space?: string | undefined; replace?: boolean | undefined } = {},
): Entry {
  const space = spaceNamed(root, options.space);
  const problems = serverProblems(name, server);
  if (problems.length > 0) throw new McpError(`${name}: ${problems.join("; ")}`);
  const servers = readFile(root, space);
  if (servers[name] && !options.replace) {
    throw new McpError(`${name} is already in ${space}: remove it first, or pass --replace`);
  }
  servers[name] = server;
  writeFile(root, space, servers);
  return { name, space, server };
}

export function removeServer(root: string, name: string, space?: string): Entry {
  const entry = find(root, name, space);
  const servers = readFile(root, entry.space);
  delete servers[name];
  writeFile(root, entry.space, servers);
  return entry;
}

export function moveServer(root: string, name: string, to: string, from?: string): Entry {
  const entry = find(root, name, from);
  const space = spaceNamed(root, to);
  if (space === entry.space) return entry;
  addServer(root, name, entry.server, { space });
  removeServer(root, name, entry.space);
  return { ...entry, space };
}

// --- The tools' own configs ------------------------------------------------

/** A server Claude Code or Codex keeps in its own config, outside the spaces. */
export type Found = {
  name: string;
  /** The file, and for a Claude server bound to a folder, the folder. */
  where: string;
  server: Server;
  /** Settings mcp.json has no place for, left behind on import. */
  dropped: string[];
  /** Literal values taken out, by the variable now in their place: for Infisical, never shown. */
  secrets: Record<string, string>;
};

function variableName(text: string) {
  return text.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

/**
 * The server as mcp.json keeps it: literal values that look secret become
 * ${NAME} (mcp.json is committed), and paths in the home folder ${HOME}/...,
 * so the server runs on another machine too.
 */
export function portable(name: string, server: Server) {
  const home = homedir();
  const local = (text: string) =>
    text === home || text.startsWith(`${home}/`) ? `\${HOME}${text.slice(home.length)}` : text;
  /** The literal values taken out, by the variable that replaces them. */
  const secrets: Record<string, string> = {};
  const result: Server = { ...server };
  if (result.command) result.command = local(result.command);
  if (result.args) result.args = result.args.map(local);
  if (result.cwd) result.cwd = local(result.cwd);
  if (result.headersHelper)
    result.headersHelper = result.headersHelper.replaceAll(`${home}/`, "${HOME}/");
  if (server.env) {
    const env = Object.fromEntries(
      Object.entries(server.env).map(([key, value]) => [key, local(value)]),
    );
    for (const key of literalSecrets({ env })) {
      secrets[key] = env[key]!;
      env[key] = `\${${key}}`;
    }
    result.env = env;
  }
  if (server.headers) {
    const headers = { ...server.headers };
    for (const key of literalSecrets({ headers })) {
      const bearer = /^bearer /i.test(headers[key]!);
      const variable = variableName(
        key.toLowerCase() === "authorization" ? `${name}_TOKEN` : `${name}_${key}`,
      );
      secrets[variable] = bearer ? headers[key]!.replace(/^bearer\s+/i, "") : headers[key]!;
      headers[key] = bearer ? `Bearer \${${variable}}` : `\${${variable}}`;
    }
    result.headers = headers;
  }
  return { server: result, secrets };
}

function fromClaude(name: string, where: string, raw: Record<string, unknown>): Found {
  const server: Server = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (
      ["type", "command", "args", "env", "cwd", "url", "headers", "headersHelper"].includes(key)
    ) {
      (server as Record<string, unknown>)[key] = value;
    } else dropped.push(key);
  }
  if (server.type === "stdio" && !server.url) delete server.type;
  if (server.type === "http" && server.url) delete server.type;
  if (server.env && Object.keys(server.env).length === 0) delete server.env;
  if (server.args && server.args.length === 0) delete server.args;
  const hidden = portable(name, server);
  return { name, where, server: hidden.server, dropped, secrets: hidden.secrets };
}

function fromCodex(name: string, where: string, raw: Record<string, unknown>): Found {
  const server: Server = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    switch (key) {
      case "command":
      case "url":
      case "cwd":
        server[key] = String(value);
        break;
      case "args":
        if (isStrings(value) && value.length > 0) server.args = value;
        break;
      case "env":
        server.env = { ...server.env, ...(value as Record<string, string>) };
        break;
      case "env_vars":
        for (const variable of value as string[]) {
          server.env = { ...server.env, [variable]: `\${${variable}}` };
        }
        break;
      case "bearer_token_env_var":
        server.headers = { ...server.headers, Authorization: `Bearer \${${String(value)}}` };
        break;
      case "http_headers":
        server.headers = { ...server.headers, ...(value as Record<string, string>) };
        break;
      case "env_http_headers":
        for (const [header, variable] of Object.entries(value as Record<string, string>)) {
          server.headers = { ...server.headers, [header]: `\${${variable}}` };
        }
        break;
      default:
        dropped.push(key);
    }
  }
  const hidden = portable(name, server);
  return { name, where, server: hidden.server, dropped, secrets: hidden.secrets };
}

function readJson(file: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function claudeConfig(file: string): Found[] {
  const data = readJson(file);
  if (!data) return [];
  const scopes: [string, unknown][] = [[homePath(file), data.mcpServers]];
  for (const [folder, project] of Object.entries((data.projects as object) ?? {})) {
    const servers = (project as Record<string, unknown>).mcpServers;
    scopes.push([`${homePath(file)} (${homePath(folder)})`, servers]);
  }
  return scopes.flatMap(([where, servers]) =>
    Object.entries((servers as object) ?? {})
      .filter(([name]) => !RESERVED.has(name))
      .map(([name, raw]) => fromClaude(name, where, raw as Record<string, unknown>)),
  );
}

function codexConfig(file: string): Found[] {
  let data: Record<string, unknown>;
  try {
    data = parseToml(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return [];
  }
  return Object.entries((data.mcp_servers as object) ?? {})
    .filter(([name]) => !RESERVED.has(name))
    .map(([name, raw]) => fromCodex(name, homePath(file), raw as Record<string, unknown>));
}

/** The servers the instance's claude/ and codex/ keep in their own configs. */
function instanceToolServers(root: string) {
  return [
    ...claudeConfig(join(root, "claude", ".claude.json")),
    ...codexConfig(join(root, "codex", "config.toml")),
  ];
}

/**
 * The servers Claude Code and Codex keep in their own configs: the instance's,
 * then the default ~/.claude.json and ~/.codex/config.toml. `home` is for the tests.
 */
export function findToolServers(root: string, home = homedir()): Found[] {
  return [
    ...instanceToolServers(root),
    ...claudeConfig(join(home, ".claude.json")),
    ...codexConfig(join(home, ".codex", "config.toml")),
  ];
}

/** Copy servers from the tools' configs into a space; the first found of each name. */
export function importServers(
  root: string,
  names: string[],
  options: {
    space?: string | undefined;
    replace?: boolean | undefined;
    home?: string | undefined;
  } = {},
) {
  const found = findToolServers(root, options.home);
  return names.map((name) => {
    const source = found.find((item) => item.name === name);
    if (!source) throw new McpError(`no server named ${name} in Claude Code's or Codex's configs`);
    const entry = addServer(root, name.replace(/[^A-Za-z0-9_-]/g, "-"), source.server, options);
    return { ...entry, source };
  });
}

// --- Checks ----------------------------------------------------------------

/**
 * What is wrong with the servers; empty when all is well. `env` holds the
 * variables a launch would have: the environment and the stored secrets.
 */
export function checkServers(root: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];
  for (const space of loadSpaces(root)) {
    let servers: Record<string, Server>;
    try {
      servers = readFile(root, space.name);
    } catch (error) {
      problems.push((error as Error).message);
      continue;
    }
    for (const [name, server] of Object.entries(servers)) {
      const where = `${space.name}/${name}`;
      for (const problem of serverProblems(name, server)) problems.push(`${where}: ${problem}`);
      if (server?.type === "sse")
        problems.push(
          `${where}: Codex has no SSE transport; it gets this server only in Claude Code`,
        );
      const text = JSON.stringify(server);
      for (const [, variable, fallback] of text.matchAll(TEMPLATE)) {
        if (!env[variable!] && fallback === undefined) {
          problems.push(`${where}: \${${variable}} is in neither Infisical nor the environment`);
        }
      }
    }
  }
  // The instance's tool configs are for what opai does not manage.
  const declared = new Set(listServers(root).map((entry) => entry.name));
  for (const found of instanceToolServers(root)) {
    if (declared.has(found.name)) {
      problems.push(
        `${found.name} is also in ${found.where}: remove it there, so one definition applies`,
      );
    }
  }
  return [...new Set(problems)];
}
