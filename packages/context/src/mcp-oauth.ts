// Sign-ins to remote MCP servers, shared by Claude Code, Codex and every
// machine of the instance. Opai signs in itself (OAuth with PKCE, a client it
// registers, a return to localhost) and keeps the tokens in the instance's
// Infisical, folder /mcp, as OAUTH_<NAME>. At launch, a server signed in this
// way gets a headers helper, `opai mcp token <name>`, which Claude Code
// (headersHelper) and Codex (http_headers_helper) run when they connect: it
// prints the Authorization header, renewing the token when it expires.
//
// A refresh token often works once. So one machine renews the tokens ahead of
// time (`opai mcp refresh`, run every few minutes), and the helpers of the
// others only read; a helper renews a token itself only once it has expired.

import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

import { deleteSecret, infisicalEnv, readSecrets, storeSecrets, variables } from "./mcp-secrets.ts";
import { listServers, McpError, type Entry, type Server } from "./mcp-servers.ts";

export type OAuthRecord = {
  name: string;
  /** The server it was signed in to; another URL under the same name is not signed in. */
  url: string;
  resource?: string | undefined;
  issuer: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string | undefined;
  authMethod: string;
  accessToken: string;
  refreshToken?: string | undefined;
  /** Milliseconds since 1970; undefined when the token does not expire. */
  expiresAt?: number | undefined;
  scope?: string | undefined;
  signedInAt: number;
  refreshedAt: number;
  /** The machine that signed in or renewed last. */
  by: string;
};

const TIMEOUT = 15_000;

export function oauthKey(name: string) {
  return `OAUTH_${name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

export function parseRecord(value: string | undefined): OAuthRecord | undefined {
  if (!value) return undefined;
  try {
    const record = JSON.parse(value) as OAuthRecord;
    return record.accessToken && record.tokenEndpoint && record.url ? record : undefined;
  } catch {
    return undefined;
  }
}

/** The sign-ins among the secrets of the folder, by server name. */
export function records(stored: Record<string, string>) {
  const result = new Map<string, OAuthRecord>();
  for (const [key, value] of Object.entries(stored)) {
    if (!key.startsWith("OAUTH_")) continue;
    const record = parseRecord(value);
    if (record) result.set(record.name, record);
  }
  return result;
}

/** A remote server that sends no Authorization of its own can take a sign-in of Opai's. */
export function canSignIn(server: Server) {
  return (
    !!server.url &&
    server.type !== "sse" &&
    !server.headersHelper &&
    !Object.keys(server.headers ?? {}).some((key) => key.toLowerCase() === "authorization")
  );
}

function expiring(record: OAuthRecord, ms: number) {
  return record.expiresAt !== undefined && record.expiresAt - Date.now() < ms;
}

/** A single-quoted shell word. */
function quote(text: string) {
  return `'${text.replaceAll("'", `'\\''`)}'`;
}

/** The command a tool runs for a server's headers; both run it in a shell. */
export function helperCommand(root: string, name: string) {
  const cli = join(import.meta.dirname, "mcp-cli.ts");
  // The node opai found on the PATH, which outlives the version this one runs.
  const node = process.env.OPAI_NODE || process.execPath;
  return `OPAI_HOME=${quote(root)} ${quote(node)} ${quote(cli)} token ${quote(name)}`;
}

/**
 * What a launch needs from Infisical, read once: the secrets the servers
 * name and the environment lacks, and the servers with a sign-in, given their
 * helper. A failure is reported, never fatal: the tool starts without them.
 */
export function prepareLaunch(
  root: string,
  servers: Record<string, Server>,
  env: NodeJS.ProcessEnv,
  warn: (message: string) => void = () => {},
) {
  const missing = [...new Set(Object.values(servers).flatMap(variables))].filter(
    (name) => !env[name],
  );
  const signable = Object.values(servers).some(canSignIn);
  if ((missing.length === 0 && !signable) || !infisicalEnv(root)) return { secrets: {}, servers };
  let stored: Record<string, string>;
  try {
    stored = readSecrets(root);
  } catch (error) {
    warn(`opai: the MCP secrets were not loaded (${(error as Error).message})`);
    return { secrets: {}, servers };
  }
  const secrets = Object.fromEntries(
    missing.filter((name) => name in stored).map((name) => [name, stored[name]!]),
  );
  const signedIn = records(stored);
  const withHelpers = Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [
      name,
      canSignIn(server) && signedIn.get(name)?.url === server.url
        ? { ...server, headersHelper: helperCommand(root, name) }
        : server,
    ]),
  );
  return { secrets, servers: withHelpers };
}

const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "opai", version: "1" },
  },
};

/**
 * Whether a remote server refuses a client without a token: then it needs a
 * sign-in, and one a tool keeps for itself serves that tool only.
 */
export async function requiresSignIn(url: string) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(INITIALIZE),
      signal: AbortSignal.timeout(10_000),
    });
    await response.body?.cancel();
    return response.status === 401;
  } catch {
    return false;
  }
}

// Discovery: the protected resource names its authorization server (RFC 9728),
// which describes its endpoints (RFC 8414). Servers of the first MCP spec have
// neither: their endpoints are at the origin.

type Discovery = {
  resource: string;
  scope?: string | undefined;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string | undefined;
};

async function getJson(url: string): Promise<Record<string, unknown> | undefined> {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    return response.ok ? ((await response.json()) as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

async function authorizationServer(issuer: string) {
  const url = new URL(issuer);
  const path = url.pathname.replace(/\/$/, "");
  const candidates = path
    ? [
        `${url.origin}/.well-known/oauth-authorization-server${path}`,
        `${url.origin}/.well-known/openid-configuration${path}`,
        `${url.origin}${path}/.well-known/openid-configuration`,
      ]
    : [
        `${url.origin}/.well-known/oauth-authorization-server`,
        `${url.origin}/.well-known/openid-configuration`,
      ];
  for (const candidate of candidates) {
    const metadata = await getJson(candidate);
    if (metadata?.authorization_endpoint && metadata.token_endpoint) return metadata;
  }
  return {
    issuer,
    authorization_endpoint: `${url.origin}/authorize`,
    token_endpoint: `${url.origin}/token`,
    registration_endpoint: `${url.origin}/register`,
  };
}

export async function discover(serverUrl: string): Promise<Discovery> {
  let metadataUrl: string | undefined;
  let scope: string | undefined;
  try {
    const response = await fetch(serverUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(INITIALIZE),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const challenge = response.headers.get("www-authenticate") ?? "";
    metadataUrl = /resource_metadata="([^"]+)"/.exec(challenge)?.[1];
    scope = /scope="([^"]+)"/.exec(challenge)?.[1];
    await response.body?.cancel();
  } catch (error) {
    throw new McpError(`${serverUrl} does not answer: ${(error as Error).message}`);
  }
  const url = new URL(serverUrl);
  const path = url.pathname.replace(/\/$/, "");
  let resource: Record<string, unknown> | undefined;
  for (const candidate of metadataUrl
    ? [metadataUrl]
    : [
        `${url.origin}/.well-known/oauth-protected-resource${path}`,
        `${url.origin}/.well-known/oauth-protected-resource`,
      ]) {
    resource = await getJson(candidate);
    if (Array.isArray(resource?.authorization_servers)) break;
    resource = undefined;
  }
  const issuer = (resource?.authorization_servers as string[] | undefined)?.[0] ?? url.origin;
  const server = await authorizationServer(issuer);
  const supported = (resource?.scopes_supported as string[] | undefined) ?? [];
  const scopes = (scope ?? supported.join(" ")).split(" ").filter(Boolean);
  // offline_access is what earns a refresh token, where the server knows it.
  if (
    (server.scopes_supported as string[] | undefined)?.includes("offline_access") &&
    !scopes.includes("offline_access")
  ) {
    scopes.push("offline_access");
  }
  return {
    resource: typeof resource?.resource === "string" ? resource.resource : serverUrl,
    scope: scopes.length > 0 ? scopes.join(" ") : undefined,
    issuer: String(server.issuer ?? issuer),
    authorizationEndpoint: String(server.authorization_endpoint),
    tokenEndpoint: String(server.token_endpoint),
    registrationEndpoint:
      typeof server.registration_endpoint === "string" ? server.registration_endpoint : undefined,
  };
}

type Client = { clientId: string; clientSecret?: string | undefined; authMethod: string };

async function register(name: string, discovery: Discovery, redirectUri: string): Promise<Client> {
  if (!discovery.registrationEndpoint) {
    throw new McpError(
      `${name}'s sign-in server registers no new client: sign in with /mcp in Claude Code instead`,
    );
  }
  const response = await fetch(discovery.registrationEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_name: "Opai",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      ...(discovery.scope && { scope: discovery.scope }),
    }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, string>;
  if (!response.ok || !data.client_id) {
    throw new McpError(
      `${name} refused to register Opai: ${data.error_description ?? data.error ?? response.status}`,
    );
  }
  return {
    clientId: data.client_id,
    clientSecret: data.client_secret,
    authMethod:
      data.token_endpoint_auth_method ?? (data.client_secret ? "client_secret_post" : "none"),
  };
}

type Tokens = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

async function tokenRequest(endpoint: string, client: Client, params: Record<string, string>) {
  const body = new URLSearchParams(params);
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
  };
  if (client.clientSecret && client.authMethod === "client_secret_basic") {
    const pair = `${encodeURIComponent(client.clientId)}:${encodeURIComponent(client.clientSecret)}`;
    headers.authorization = `Basic ${Buffer.from(pair).toString("base64")}`;
  } else {
    body.set("client_id", client.clientId);
    if (client.clientSecret) body.set("client_secret", client.clientSecret);
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof data.access_token !== "string") {
    throw new McpError(
      `the token was refused: ${String(data.error_description ?? data.error ?? response.status)}`,
    );
  }
  return data as Tokens;
}

function expiresAt(tokens: Tokens) {
  return typeof tokens.expires_in === "number" ? Date.now() + tokens.expires_in * 1000 : undefined;
}

/** Renews a token with its refresh token, and stores the result. */
async function renew(root: string, record: OAuthRecord): Promise<OAuthRecord> {
  if (!record.refreshToken) {
    throw new McpError(`${record.name}: the token expired and can't be renewed: sign in again`);
  }
  const tokens = await tokenRequest(record.tokenEndpoint, record, {
    grant_type: "refresh_token",
    refresh_token: record.refreshToken,
    ...(record.resource && { resource: record.resource }),
  });
  const next: OAuthRecord = {
    ...record,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? record.refreshToken,
    expiresAt: expiresAt(tokens),
    scope: tokens.scope ?? record.scope,
    refreshedAt: Date.now(),
    by: hostname(),
  };
  storeSecrets(root, { [oauthKey(record.name)]: JSON.stringify(next) });
  return next;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One renewal at a time for a server on this machine: two sessions that start
 * together would spend the same refresh token. A lock left over a minute is
 * stale; after 20 seconds of waiting, the work goes on without it.
 */
async function locked<T>(root: string, name: string, work: () => Promise<T>) {
  const folder = join(root, ".local", "mcp", "locks");
  mkdirSync(folder, { recursive: true });
  const lock = join(folder, oauthKey(name));
  const deadline = Date.now() + 20_000;
  let held = false;
  while (!held && Date.now() < deadline) {
    try {
      mkdirSync(lock);
      held = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lock).mtimeMs > 60_000)
          rmSync(lock, { recursive: true, force: true });
      } catch {}
      await sleep(250);
    }
  }
  try {
    return await work();
  } finally {
    if (held) rmSync(lock, { recursive: true, force: true });
  }
}

function readRecord(root: string, name: string) {
  const key = oauthKey(name);
  return parseRecord(readSecrets(root, [key])[key]);
}

/**
 * A valid access token for the server, or undefined when it has no sign-in of
 * Opai's. It renews an expired one; when another machine renewed it first,
 * the refresh token is spent, and the record it stored is the answer.
 */
export async function accessToken(root: string, name: string) {
  const record = readRecord(root, name);
  if (!record) return undefined;
  if (!expiring(record, 60_000)) return record.accessToken;
  try {
    return await locked(root, name, async () => {
      // Another session may have renewed it while this one waited.
      const fresh = readRecord(root, name) ?? record;
      return expiring(fresh, 60_000) ? (await renew(root, fresh)).accessToken : fresh.accessToken;
    });
  } catch (error) {
    const again = readRecord(root, name);
    if (again && again.accessToken !== record.accessToken && !expiring(again, 0)) {
      return again.accessToken;
    }
    throw error;
  }
}

/** Renews the tokens that expire within `ms`: what one machine runs on a schedule. */
export async function refreshAll(root: string, ms = 20 * 60_000) {
  const results: { name: string; renewed: boolean; error?: string }[] = [];
  for (const record of records(readSecrets(root)).values()) {
    if (!expiring(record, ms)) {
      results.push({ name: record.name, renewed: false });
      continue;
    }
    try {
      await locked(root, record.name, () => renew(root, record));
      results.push({ name: record.name, renewed: true });
    } catch (error) {
      results.push({ name: record.name, renewed: false, error: (error as Error).message });
    }
  }
  return results;
}

/** What the app may show of a sign-in: never its tokens. */
export function describeRecord(record: OAuthRecord) {
  return {
    by: record.by,
    signedInAt: record.signedInAt,
    refreshedAt: record.refreshedAt,
    expiresAt: record.expiresAt,
    renewable: !!record.refreshToken,
  };
}

export function signOut(root: string, name: string) {
  deleteSecret(root, oauthKey(name));
  version++;
}

// The sign-in itself, from the app or `opai mcp login`.

export type Login = {
  state: "waiting" | "connected" | "failed";
  authUrl?: string | undefined;
  error?: string | undefined;
};

const LOGIN_MS = 10 * 60_000;
const logins = new Map<string, Login & { close?: () => void }>();
let version = 0;

/** Grows with each sign-in or sign-out, so a status check knows it is stale. */
export function signInVersion() {
  return version;
}

function find(root: string, name: string, space?: string): Entry {
  const entries = listServers(root).filter(
    (entry) => entry.name === name && (!space || entry.space === space),
  );
  if (entries.length === 0) throw new McpError(`no server named ${name}`);
  if (entries.length > 1) {
    throw new McpError(
      `${name} is in ${entries.map((entry) => entry.space).join(" and ")}: name the space`,
    );
  }
  return entries[0]!;
}

const base64url = (bytes: Buffer) => bytes.toString("base64url");

type Callback = { params: URLSearchParams; answer: (ok: boolean, text: string) => void };

/** A server on localhost for the browser's return; it serves one callback. */
function listen(): Promise<{ port: number; close: () => void; callback: Promise<Callback> }> {
  return new Promise((resolve, reject) => {
    let deliver!: (callback: Callback) => void;
    const callback = new Promise<Callback>((done) => (deliver = done));
    const servers: HttpServer[] = [];
    const handle = (
      request: import("node:http").IncomingMessage,
      response: import("node:http").ServerResponse,
    ) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (url.pathname !== "/callback") {
        response.writeHead(404).end();
        return;
      }
      deliver({
        params: url.searchParams,
        answer: (ok, text) =>
          response
            .writeHead(ok ? 200 : 400, { "content-type": "text/html; charset=utf-8" })
            .end(
              `<!doctype html><meta charset="utf-8"><title>Opai</title><body style="font:16px system-ui;padding:3rem">${text.replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"))}</body>`,
            ),
      });
    };
    const first = createServer(handle);
    servers.push(first);
    first.on("error", reject);
    first.listen(0, "127.0.0.1", () => {
      const port = (first.address() as { port: number }).port;
      // localhost may be ::1 in the browser: listen there too, when it exists.
      const second = createServer(handle);
      second.on("error", () => {});
      second.listen(port, "::1");
      servers.push(second);
      resolve({ port, close: () => servers.forEach((server) => server.close()), callback });
    });
  });
}

/**
 * Starts a sign-in: the page the browser opens. A server on localhost waits
 * for its return, stores the tokens, and the sign-in ends connected, failed,
 * or after 10 minutes.
 */
export async function startLogin(root: string, name: string, space?: string) {
  const entry = find(root, name, space);
  if (!entry.server.url) {
    throw new McpError(`${name} runs a command: there is nothing to sign in to`);
  }
  if (!canSignIn(entry.server)) {
    throw new McpError(`${name} sends its own Authorization: it takes no sign-in`);
  }
  if (!infisicalEnv(root))
    throw new McpError("the instance has no Infisical project to keep the sign-in");
  const key = `${entry.space}/${entry.name}`;
  logins.get(key)?.close?.();
  const discovery = await discover(entry.server.url);
  const { port, close, callback } = await listen();
  const login: Login & { close?: () => void } = { state: "waiting", close };
  logins.set(key, login);
  const end = (state: Login["state"], error?: string) => {
    login.state = state;
    login.error = error;
    delete login.close;
    close();
  };
  try {
    const redirectUri = `http://localhost:${port}/callback`;
    const client = await register(name, discovery, redirectUri);
    const verifier = base64url(randomBytes(32));
    const state = base64url(randomBytes(16));
    const authUrl = new URL(discovery.authorizationEndpoint);
    for (const [param, value] of Object.entries({
      response_type: "code",
      client_id: client.clientId,
      redirect_uri: redirectUri,
      code_challenge: base64url(createHash("sha256").update(verifier).digest()),
      code_challenge_method: "S256",
      state,
      resource: discovery.resource,
      ...(discovery.scope && { scope: discovery.scope }),
    })) {
      authUrl.searchParams.set(param, value);
    }
    login.authUrl = authUrl.toString();
    const timer = setTimeout(() => end("failed", "the sign-in was not finished in time"), LOGIN_MS);
    void callback.then(async ({ params, answer }) => {
      clearTimeout(timer);
      try {
        if (params.get("state") !== state)
          throw new McpError("the sign-in came back for another attempt");
        const refused = params.get("error_description") ?? params.get("error");
        if (refused) throw new McpError(`${name} refused the sign-in: ${refused}`);
        const tokens = await tokenRequest(discovery.tokenEndpoint, client, {
          grant_type: "authorization_code",
          code: params.get("code") ?? "",
          redirect_uri: redirectUri,
          code_verifier: verifier,
          resource: discovery.resource,
        });
        const now = Date.now();
        const record: OAuthRecord = {
          name,
          url: entry.server.url!,
          resource: discovery.resource,
          issuer: discovery.issuer,
          tokenEndpoint: discovery.tokenEndpoint,
          ...client,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: expiresAt(tokens),
          scope: tokens.scope ?? discovery.scope,
          signedInAt: now,
          refreshedAt: now,
          by: hostname(),
        };
        storeSecrets(root, { [oauthKey(name)]: JSON.stringify(record) });
        version++;
        answer(true, `Opai is signed in to ${name}. You can close this tab.`);
        end("connected");
      } catch (error) {
        answer(false, `The sign-in to ${name} failed: ${(error as Error).message}`);
        end("failed", (error as Error).message);
      }
    });
  } catch (error) {
    end("failed", (error as Error).message);
    throw error;
  }
  return { space: entry.space, name: entry.name, authUrl: login.authUrl };
}

/** Where a sign-in stands; undefined when none was started. */
export function loginState(space: string, name: string): Login | undefined {
  const login = logins.get(`${space}/${name}`);
  return login && { state: login.state, authUrl: login.authUrl, error: login.error };
}
