// Whether Claude Code reaches each MCP server. Claude itself answers: a
// headless `claude -p`, with the servers of one space as a session gets them
// (secrets and sign-ins of mcp-oauth.ts), answers the Agent SDK's mcp_status
// control request. No prompt is sent, so no model runs, and
// --no-session-persistence leaves no session.

import { spawn, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

import { canSignIn, prepareLaunch, requiresSignIn, signInVersion } from "./mcp-oauth.ts";
import { claudeServer, listServers, McpError, type Server } from "./mcp-servers.ts";

export type Status = "connected" | "needs-auth" | "failed" | "pending" | "disabled";
export type ServerStatus = {
  space: string;
  name: string;
  status: Status;
  error?: string;
  /** It refuses a client without a token: it needs a sign-in. */
  protected?: boolean;
};

type Response = Record<string, unknown>;
type Waiting = { resolve: (value: Response) => void; reject: (error: Error) => void };

/** One headless Claude Code, with the servers it is given and nothing else. */
class ClaudeControl {
  #child: ChildProcess;
  #waiting = new Map<string, Waiting>();
  #next = 0;
  #stopped: Error | undefined;
  ready: Promise<Response>;

  constructor(root: string, servers: Record<string, Server>) {
    // As in a session: the secrets from Infisical, and the sign-ins of Opai.
    const launch = prepareLaunch(root, servers, process.env);
    const env = { ...process.env, ...launch.secrets };
    const config = Object.fromEntries(
      Object.entries(launch.servers).map(([name, server]) => [name, claudeServer(server)]),
    );
    this.#child = spawn(
      "claude",
      [
        "-p",
        "--input-format=stream-json",
        "--output-format=stream-json",
        "--verbose",
        "--no-session-persistence",
        "--strict-mcp-config",
        `--settings=${JSON.stringify({ disableAllHooks: true })}`,
        `--mcp-config=${JSON.stringify({ mcpServers: config })}`,
      ],
      // Outside any project, so no .mcp.json or CLAUDE.md of a folder joins in.
      { cwd: tmpdir(), env: { ...env, CLAUDE_CONFIG_DIR: join(root, "claude") }, stdio: "pipe" },
    );
    this.#child.stdin!.on("error", () => {});
    this.#child.on("error", (error) =>
      this.#stop(
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? new McpError("Claude Code is not installed (no claude command)")
          : error,
      ),
    );
    this.#child.on("exit", () => this.#stop(new McpError("Claude Code stopped")));
    createInterface({ input: this.#child.stdout! }).on("line", (line) => this.#read(line));
    this.ready = this.request({ subtype: "initialize" });
  }

  #read(line: string) {
    let message: { type?: string; response?: Response };
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.type !== "control_response" || !message.response) return;
    const { request_id: id, subtype, error, response } = message.response;
    const waiting = this.#waiting.get(String(id));
    if (!waiting) return;
    this.#waiting.delete(String(id));
    if (subtype === "error") waiting.reject(new McpError(String(error)));
    else waiting.resolve((response as Response) ?? {});
  }

  #stop(error: Error) {
    this.#stopped ??= error;
    for (const waiting of this.#waiting.values()) waiting.reject(error);
    this.#waiting.clear();
  }

  request(request: Response, timeout = 30_000): Promise<Response> {
    if (this.#stopped) return Promise.reject(this.#stopped);
    const id = String(++this.#next);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiting.delete(id);
        reject(new McpError(`Claude Code did not answer ${String(request.subtype)}`));
      }, timeout);
      this.#waiting.set(id, {
        resolve: (value) => (clearTimeout(timer), resolve(value)),
        reject: (error) => (clearTimeout(timer), reject(error)),
      });
      this.#child.stdin!.write(
        `${JSON.stringify({ type: "control_request", request_id: id, request })}\n`,
      );
    });
  }

  async status() {
    await this.ready;
    const { mcpServers } = await this.request({ subtype: "mcp_status" });
    return (mcpServers ?? []) as { name: string; status: Status; error?: string }[];
  }

  close() {
    this.#stop(new McpError("closed"));
    this.#child.kill();
  }
}

/** An error as one line: a server that answers with an HTML page gives its title. */
export function shortError(error: string | undefined) {
  if (!error) return undefined;
  const html = error.search(/<(!doctype|html)/i);
  let text = error;
  if (html >= 0) {
    const title = /<title>([^<]*)<\/title>/i.exec(error)?.[1]?.trim();
    text = `${error.slice(0, html).trim()} an HTML page${title ? `, "${title}"` : ""}`;
  }
  text = text.replace(/\s+/g, " ").trim();
  return text.length > 240 ? `${text.slice(0, 239)}…` : text;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The statuses once the servers have connected, or the time is up. */
async function settle(control: ClaudeControl, ms: number) {
  const deadline = Date.now() + ms;
  for (;;) {
    const servers = await control.status();
    if (Date.now() > deadline || servers.every((server) => server.status !== "pending")) {
      return servers;
    }
    await sleep(500);
  }
}

/** Every declared server's status, each space checked with its own servers. */
export async function checkStatus(root: string, entries = listServers(root)) {
  const spaces = [...new Set(entries.map((entry) => entry.space))];
  const results = await Promise.all(
    spaces.map(async (space): Promise<ServerStatus[]> => {
      const own = entries.filter((entry) => entry.space === space);
      const control = new ClaudeControl(
        root,
        Object.fromEntries(own.map((entry) => [entry.name, entry.server])),
      );
      const guarded = Promise.all(
        own.map((entry) => (canSignIn(entry.server) ? requiresSignIn(entry.server.url!) : false)),
      );
      try {
        const found = new Map((await settle(control, 20_000)).map((s) => [s.name, s]));
        const needs = await guarded;
        return own.map(({ name }, index) => {
          const server = found.get(name);
          return {
            space,
            name,
            status: server?.status ?? "failed",
            ...(server?.error && { error: shortError(server.error) }),
            ...(needs[index] && { protected: true }),
          };
        });
      } catch (error) {
        return own.map(({ name }) => ({
          space,
          name,
          status: "failed",
          error: (error as Error).message,
        }));
      } finally {
        control.close();
      }
    }),
  );
  return results.flat();
}

const STATUS_MS = 5 * 60_000;
let cache: { key: string; at: number; result: Promise<ServerStatus[]> } | undefined;

/** Drops the last check, after a change it can't see, such as a stored secret. */
export function forgetStatus() {
  cache = undefined;
}

/**
 * The statuses of a check under 5 minutes old, for the same servers and
 * sign-ins; a new check otherwise, or when `refresh`.
 */
export async function cachedStatus(root: string, refresh = false) {
  const entries = listServers(root);
  const key = `${signInVersion()} ${JSON.stringify(entries)}`;
  if (refresh || !cache || cache.key !== key || Date.now() - cache.at > STATUS_MS) {
    cache = { key, at: Date.now(), result: checkStatus(root, entries) };
  }
  const { at, result } = cache;
  const servers = await result.catch((error: unknown) => {
    cache = undefined;
    throw error;
  });
  return { checkedAt: at, servers };
}
