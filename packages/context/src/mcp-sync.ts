// The servers of global, written into the configs plain Claude Code and Codex
// read: ~/.claude.json and ~/.codex/config.toml. Apps that start them outside
// Opai (Claude Desktop, the ChatGPT app) then have the same servers, and the
// spaces stay their one source.
//
// No secret is written. A remote server that needs one gets a headers helper
// (`opai mcp headers <name>`) that reads it from Infisical, with Opai's
// sign-in; a local one starts through `opai mcp run <name>`, which puts its
// secrets in its environment, and finds npx and the like on a PATH that the
// apps keep short. The names written are kept in
// .local/mcp/synced.json, per machine, so that a server that leaves global
// leaves those configs too; a server of the same name already there is replaced.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { parse as parseToml } from "smol-toml";

import { forgetNeedsAuth, records, type OAuthRecord } from "./mcp-oauth.ts";
import { infisicalEnv, readSecrets, variables } from "./mcp-secrets.ts";
import {
  claudeServer,
  codexServer,
  globalServers,
  inlineToml,
  replaceFile,
  syncedFile,
  syncedNames,
  tomlKey,
  withoutCodexServer,
  type Server,
} from "./mcp-servers.ts";

const START =
  "# >>> opai mcp: the servers of global, written by `opai mcp sync`; edit them in Opai";
const END = "# <<< opai mcp";

/** A single-quoted shell word. */
function quote(text: string) {
  return `'${text.replaceAll("'", `'\\''`)}'`;
}

/**
 * The node and the opai mcp script, through the instance's links that
 * `opai setup` keeps pointing to this machine's: the configs outlive a move.
 */
function cli(root: string) {
  const node = join(root, ".local", "node");
  const script = join(root, ".local", "engine", "packages", "context", "src", "mcp-cli.ts");
  if (existsSync(node) && existsSync(script)) return { node, script };
  return {
    node: process.env.OPAI_NODE || process.execPath,
    script: join(import.meta.dirname, "mcp-cli.ts"),
  };
}

function withHome<T>(value: T, home: string): T {
  return JSON.parse(JSON.stringify(value).replaceAll("${HOME}", home)) as T;
}

/**
 * A server as an app outside Opai gets it, or why it gets none: the secrets
 * it names come from Opai at run time, never from the file.
 */
export function outsideServer(
  root: string,
  name: string,
  server: Server,
  signedIn: boolean,
  home = homedir(),
): Server | string {
  const secret = (value: unknown) => variables(value).length > 0;
  const { node, script } = cli(root);
  if (server.command) {
    const own = withHome(server, home);
    if (!secret(server) && own.command!.startsWith("/")) return own;
    return {
      command: node,
      args: [script, "run", name],
      env: { OPAI_HOME: root },
      // Codex gets what the server changes for it.
      ...(server.codex && { codex: { args: [script, "run", name, "--codex"] } }),
    };
  }
  if (secret(server.url) || secret(server.headersHelper)) {
    return "its URL or headers helper names a secret";
  }
  const headers = Object.fromEntries(
    Object.entries(server.headers ?? {}).filter(([, value]) => !secret(value)),
  );
  const helper = signedIn || Object.keys(headers).length < Object.keys(server.headers ?? {}).length;
  if (helper && server.headersHelper) return "it has a headers helper of its own";
  const result: Server = { ...server };
  delete result.headers;
  if (Object.keys(headers).length > 0) result.headers = headers;
  if (helper) {
    result.headersHelper = `OPAI_HOME=${quote(root)} ${quote(node)} ${quote(script)} headers ${quote(name)}`;
  }
  return withHome(result, home);
}

function codexBlock(servers: Record<string, Record<string, unknown>>) {
  const tables = Object.entries(servers).map(([name, table]) =>
    [
      `[mcp_servers.${tomlKey(name)}]`,
      ...Object.entries(table).map(([key, value]) => `${tomlKey(key)} = ${inlineToml(value)}`),
    ].join("\n"),
  );
  return [START, tables.join("\n\n"), END].join("\n");
}

/** ~/.claude.json with the servers of global: those Opai wrote before and global lost go. */
function syncClaude(file: string, servers: Record<string, Server>, before: string[]) {
  if (!existsSync(file)) return false;
  const text = readFileSync(file, "utf8");
  const data = JSON.parse(text) as { mcpServers?: Record<string, unknown> };
  const mcpServers = { ...data.mcpServers };
  for (const name of before) if (!(name in servers)) delete mcpServers[name];
  Object.assign(mcpServers, servers);
  data.mcpServers = mcpServers;
  const after = `${JSON.stringify(data, null, 2)}${text.endsWith("\n") ? "\n" : ""}`;
  if (after === text) return false;
  replaceFile(file, after);
  return true;
}

/**
 * ~/.codex/config.toml with the servers of global, in a marked block at its
 * end; a table of the same name elsewhere goes, every other line stays.
 */
function syncCodex(
  file: string,
  servers: Record<string, Record<string, unknown>>,
  before: string[],
) {
  if (!existsSync(dirname(file))) return { changed: false, refused: [] as string[] };
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  let rest = text
    .split("\n")
    .filter((line) => line !== START && line !== END)
    .join("\n");
  const refused: string[] = [];
  const written = { ...servers };
  for (const name of new Set([...before, ...Object.keys(servers)])) {
    const without = withoutCodexServer(rest, name);
    if (without === undefined) {
      // Written another way (inline, dotted keys): left there, and not written twice.
      refused.push(name);
      delete written[name];
    } else rest = without;
  }
  rest = rest.replace(/\n+$/, "");
  const block = Object.keys(written).length > 0 ? codexBlock(written) : "";
  const after = `${[rest, block].filter(Boolean).join("\n\n")}\n`;
  parseToml(after);
  if (after === text) return { changed: false, refused };
  if (existsSync(file)) replaceFile(file, after);
  else writeFileSync(file, after, { mode: 0o600 });
  return { changed: true, refused };
}

/**
 * Writes the servers of global into the tools' own configs. `signedIn` holds
 * Opai's sign-ins; read from Infisical when not given.
 */
export function syncTools(
  root: string,
  signedIn?: Map<string, Pick<OAuthRecord, "url">>,
  home = homedir(),
) {
  const servers = globalServers(root);
  const signed = signedIn ?? (infisicalEnv(root) ? records(readSecrets(root)) : new Map());
  const claude: Record<string, Server> = {};
  const codex: Record<string, Record<string, unknown>> = {};
  const skipped: string[] = [];
  const helped: string[] = [];
  for (const [name, server] of Object.entries(servers)) {
    const isSigned = !!server.url && signed.get(name)?.url === server.url;
    if (isSigned) helped.push(name);
    const outside = outsideServer(root, name, server, isSigned, home);
    if (typeof outside === "string") {
      skipped.push(`${name}: ${outside}`);
      continue;
    }
    claude[name] = claudeServer(outside);
    const table = codexServer(outside, { HOME: home });
    if (table) codex[name] = table;
  }
  forgetNeedsAuth(root, helped, home);
  const before = syncedNames(root);
  const changed: string[] = [];
  const claudeFile = join(home, ".claude.json");
  if (syncClaude(claudeFile, claude, before.claude)) changed.push(claudeFile);
  const codexFile = join(home, ".codex", "config.toml");
  const result = syncCodex(codexFile, codex, before.codex);
  if (result.changed) changed.push(codexFile);
  for (const name of result.refused) {
    skipped.push(`${name}: written in ${codexFile} other than as [mcp_servers.${name}]`);
  }
  const now = `${JSON.stringify(
    {
      claude: existsSync(claudeFile) ? Object.keys(claude) : [],
      codex: Object.keys(codex).filter((name) => !result.refused.includes(name)),
    },
    null,
    2,
  )}\n`;
  const file = syncedFile(root);
  if (!existsSync(file) || readFileSync(file, "utf8") !== now) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, now);
  }
  return { changed, skipped };
}

/** syncTools for a change made elsewhere: a failure is told, never thrown. */
export function syncQuietly(
  root: string,
  signedIn?: Map<string, Pick<OAuthRecord, "url">>,
): { changed: string[]; skipped: string[]; error?: string } {
  try {
    return syncTools(root, signedIn);
  } catch (error) {
    return { changed: [], skipped: [], error: (error as Error).message };
  }
}
