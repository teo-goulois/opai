// opai mcp: the command line of mcp-servers.ts.
//
//   opai mcp list
//   opai mcp add <name> <url> [--space s] [--header "Name: value"]...
//   opai mcp add <name> [--space s] [--env NAME=value]... -- <command> [args...]
//   opai mcp paste '<command or JSON>' [--space s] [--name n] [--replace]
//   opai mcp remove <name> [--space s]
//   opai mcp move <name> <space> [--from s]
//   opai mcp import [<name>...] [--space s] [--replace]
//   opai mcp secrets
//   opai mcp secret set <NAME>
//   opai mcp check
//   opai mcp status
//   opai mcp login <name> [--space s]
//   opai mcp logout <name>
//   opai mcp refresh [--install | --uninstall]
//   opai mcp token <name>          (the headers helper of a signed-in server)

import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

import {
  addServer,
  checkServers,
  findToolServers,
  importServers,
  listServers,
  McpError,
  mcpFile,
  moveServer,
  removeServer,
  type Server,
} from "./mcp-servers.ts";
import { parsePaste } from "./mcp-paste.ts";
import { readSecrets, storeSecrets, variables } from "./mcp-secrets.ts";
import { accessToken, loginState, refreshAll, signOut, startLogin } from "./mcp-oauth.ts";
import { checkStatus } from "./mcp-status.ts";
import { homePath, ROOT } from "./spaces.ts";

/** The names stored in Infisical, or undefined when it can't be read. */
function storedNames() {
  try {
    return new Set(Object.keys(readSecrets(ROOT)));
  } catch (error) {
    console.error(`opai mcp: ${(error as Error).message}`);
    return undefined;
  }
}

/** A value typed without echo, or piped in. */
async function readValue(name: string) {
  const { stdin, stderr } = process;
  if (!stdin.isTTY) {
    let text = "";
    for await (const chunk of stdin) text += chunk;
    return text.replace(/\r?\n$/, "");
  }
  stderr.write(`${name}: `);
  stdin.setRawMode(true);
  let value = "";
  for await (const chunk of stdin) {
    for (const char of String(chunk)) {
      if (char === "\r" || char === "\n") {
        stdin.setRawMode(false);
        stdin.pause();
        stderr.write("\n");
        return value;
      }
      if (char === "\u0003") process.exit(130);
      value = char === "\u007f" ? value.slice(0, -1) : value + char;
    }
  }
  return value;
}

const USAGE = `usage: opai mcp <command>

  list                                          every server, by space
  add <name> <url> [--space s] [--header "H: v"]...
  add <name> [--space s] [--env K=v]... -- <command> [args...]
                                                declare a server (global by default)
  paste '<text>' [--space s] [--name n]         add what a provider's docs say to paste: a claude
                                                or codex mcp add command, JSON, a command, a URL;
                                                its tokens go to Infisical
  remove <name> [--space s]                     remove it
  move <name> <space> [--from s]                move it to another space
  import [<name>...] [--space s] [--replace]    copy servers Claude Code or Codex keep
                                                in their own configs; with no name, list them
  secrets                                       the secrets the servers name, stored or missing
  secret set <NAME>                             store one in Infisical, typed or piped in
  check                                         report what is wrong
  status                                        whether Claude Code reaches each server
  login <name> [--space s]                      sign in to a remote server, in the browser, for
                                                Claude Code, Codex and every machine (Infisical)
  logout <name>                                 forget that sign-in
  refresh [--install | --uninstall]             renew the tokens about to expire; --install runs
                                                it every 10 minutes with launchd, on one machine

Servers of global are in every session; those of another space only in its
sessions. opai claude and opai codex load them at launch, so a change applies
from the next session. Keep secrets out: write \${NAME}, and store NAME in
Infisical (folder /mcp) or set it in the environment, as "API_KEY": "\${API_KEY}" or "Authorization": "Bearer \${TOKEN}".`;

function describe(server: Server) {
  const target = server.url ?? [server.command, ...(server.args ?? [])].join(" ");
  const type = server.type === "sse" ? "sse " : "";
  const env = Object.keys({ ...server.env, ...server.headers });
  return `${type}${target}${env.length > 0 ? `  (${env.join(", ")})` : ""}`;
}

function pairs(items: string[] | undefined, separator: string, label: string) {
  const result: Record<string, string> = {};
  for (const item of items ?? []) {
    const at = item.indexOf(separator);
    if (at <= 0) throw new McpError(`${label} ${item}: expected name${separator}value`);
    result[item.slice(0, at).trim()] = item.slice(at + separator.length).trim();
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

const REFRESH_LABEL = "dev.opai.mcp-refresh";

function notify(message: string) {
  if (process.platform !== "darwin") return;
  try {
    execFileSync("osascript", [
      "-e",
      `display notification ${JSON.stringify(message)} with title "Opai MCP"`,
    ]);
  } catch {}
}

const xml = (text: string) => text.replace(/[&<>]/g, (char) => `&#${char.charCodeAt(0)};`);

/** One machine renews the tokens: a launchd agent, every 10 minutes and at load. */
function scheduleRefresh(install: boolean) {
  if (process.platform !== "darwin") throw new McpError("--install uses launchd: macOS only");
  const home = homedir();
  const plist = join(home, "Library", "LaunchAgents", `${REFRESH_LABEL}.plist`);
  const log = join(home, "Library", "Logs", "opai", "mcp-refresh.log");
  const domain = `gui/${process.getuid!()}`;
  try {
    execFileSync("launchctl", ["bootout", `${domain}/${REFRESH_LABEL}`], { stdio: "ignore" });
  } catch {}
  if (!install) {
    rmSync(plist, { force: true });
    console.log("This machine no longer renews the MCP tokens.");
    return;
  }
  const node = process.env.OPAI_NODE || process.execPath;
  const args = [
    "/usr/bin/env",
    "-i",
    `HOME=${home}`,
    "PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    `OPAI_HOME=${ROOT}`,
    `OPAI_NODE=${node}`,
    node,
    join(import.meta.dirname, "mcp-cli.ts"),
    "refresh",
  ];
  mkdirSync(join(home, "Library", "Logs", "opai"), { recursive: true });
  mkdirSync(join(home, "Library", "LaunchAgents"), { recursive: true });
  writeFileSync(
    plist,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${REFRESH_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args.map((arg) => `    <string>${xml(arg)}</string>`).join("\n")}
  </array>
  <key>StartInterval</key>
  <integer>600</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${xml(log)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(log)}</string>
</dict>
</plist>
`,
  );
  execFileSync("launchctl", ["bootstrap", domain, plist]);
  console.log(`This machine renews the MCP tokens every 10 minutes. Log: ${homePath(log)}`);
}

async function main(argv: string[]) {
  const [command, ...rest] = argv;
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      space: { type: "string" },
      from: { type: "string" },
      env: { type: "string", multiple: true },
      header: { type: "string", multiple: true },
      type: { type: "string" },
      name: { type: "string" },
      replace: { type: "boolean" },
      install: { type: "boolean" },
      uninstall: { type: "boolean" },
    },
  });

  switch (command) {
    case "list": {
      let space = "";
      for (const entry of listServers(ROOT)) {
        if (entry.space !== space) {
          space = entry.space;
          console.log(`\n${space}`);
        }
        console.log(`  ${entry.name}  ${describe(entry.server)}`);
      }
      if (!space) console.log("No server declared. Add one with: opai mcp add");
      return;
    }
    case "add": {
      const [name, target, ...args] = positionals;
      if (!name || !target) throw new McpError("add <name> <url> | add <name> -- <command> [args]");
      const remote = /^https?:\/\//.test(target);
      const type = values.type as Server["type"] | undefined;
      const server: Server = remote
        ? { ...(type === "sse" && { type }), url: target }
        : { command: target, ...(args.length > 0 && { args }) };
      const env = pairs(values.env, "=", "--env");
      const headers = pairs(values.header, ":", "--header");
      if (env) server.env = env;
      if (headers) server.headers = headers;
      const entry = addServer(ROOT, name, server, values);
      console.log(`Added ${entry.name} to ${entry.space}: ${homePath(mcpFile(ROOT, entry.space))}`);
      return;
    }
    case "paste": {
      const [text] = positionals;
      if (!text) throw new McpError("paste '<command or JSON>'");
      const pasted = parsePaste(text, values.name);
      const secrets = Object.assign({}, ...pasted.map((item) => item.secrets));
      // The secrets first: a server must not name a variable that was never stored.
      if (Object.keys(secrets).length > 0) {
        storeSecrets(ROOT, secrets);
        console.log(`Stored in Infisical (/mcp): ${Object.keys(secrets).join(", ")}`);
      }
      for (const item of pasted) {
        const entry = addServer(ROOT, item.name, item.server, values);
        console.log(`Added ${entry.name} to ${entry.space}: ${describe(entry.server)}`);
        for (const note of item.notes) console.log(`  left behind: ${note}`);
      }
      return;
    }
    case "remove": {
      const [name] = positionals;
      if (!name) throw new McpError("remove <name>");
      const entry = removeServer(ROOT, name, values.space);
      console.log(`Removed ${entry.name} from ${entry.space}`);
      return;
    }
    case "move": {
      const [name, space] = positionals;
      if (!name || !space) throw new McpError("move <name> <space>");
      const entry = moveServer(ROOT, name, space, values.from);
      console.log(`Moved ${entry.name} to ${entry.space}`);
      return;
    }
    case "import": {
      if (positionals.length === 0) {
        const declared = new Set(listServers(ROOT).map((entry) => entry.name));
        for (const found of findToolServers(ROOT)) {
          const mark = declared.has(found.name) ? "  (declared)" : "";
          console.log(`${found.name}  ${describe(found.server)}${mark}\n    in ${found.where}`);
        }
        return;
      }
      for (const { name, space, source } of importServers(ROOT, positionals, values)) {
        console.log(`Imported ${name} into ${space}, from ${source.where}`);
        const secrets = Object.keys(source.secrets);
        if (secrets.length > 0) {
          try {
            storeSecrets(ROOT, source.secrets);
            console.log(`  stored in Infisical (/mcp): ${secrets.join(", ")}`);
          } catch (error) {
            console.log(`  not stored (${(error as Error).message}): ${secrets.join(", ")}`);
            console.log(`  store each with opai mcp secret set <NAME>`);
          }
        }
        if (source.dropped.length > 0) console.log(`  left behind: ${source.dropped.join(", ")}`);
      }
      return;
    }
    case "secrets": {
      const stored = storedNames();
      const names = new Map<string, string[]>();
      for (const entry of listServers(ROOT)) {
        for (const name of variables(entry.server)) {
          names.set(name, [...(names.get(name) ?? []), entry.name]);
        }
      }
      for (const [name, servers] of [...names].sort()) {
        const state = stored?.has(name)
          ? "in Infisical"
          : process.env[name]
            ? "in the environment"
            : "missing";
        console.log(`${name}  ${state}  (${servers.join(", ")})`);
      }
      return;
    }
    case "secret": {
      const [action, name] = positionals;
      if (action !== "set" || !name || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        throw new McpError("secret set <NAME>");
      }
      const value = await readValue(name);
      if (!value) throw new McpError("no value given");
      storeSecrets(ROOT, { [name]: value });
      console.log(`Stored ${name} in Infisical (/mcp).`);
      return;
    }
    case "check": {
      const stored = storedNames();
      const known = Object.fromEntries([...(stored ?? [])].map((name) => [name, "stored"]));
      const problems = checkServers(ROOT, { ...process.env, ...known });
      for (const problem of problems) console.log(problem);
      if (problems.length > 0) process.exitCode = 1;
      else console.log("MCP servers are in order.");
      return;
    }
    case "status": {
      const statuses = await checkStatus(ROOT);
      let space = "";
      for (const item of statuses) {
        if (item.space !== space) {
          space = item.space;
          console.log(`\n${space}`);
        }
        console.log(`  ${item.name}  ${item.status}${item.error ? `  (${item.error})` : ""}`);
      }
      if (statuses.some((item) => item.status === "needs-auth")) {
        console.log("\nSign in to a needs-auth server with: opai mcp login <name>");
      }
      return;
    }
    case "login": {
      const [name] = positionals;
      if (!name) throw new McpError("login <name>");
      const login = await startLogin(ROOT, name, values.space);
      if (!login.authUrl) throw new McpError(`${name} gave no page to sign in on`);
      console.log(`Sign in to ${login.name} in the browser:\n  ${login.authUrl}`);
      console.log("The sign-in serves Claude Code, Codex and every machine of the instance.");
      if (process.platform === "darwin") execFile("open", [login.authUrl]);
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const state = loginState(login.space, login.name);
        if (state?.state === "connected") {
          console.log(`${login.name} is connected.`);
          process.exit(0);
        }
        if (state?.state !== "waiting") throw new McpError(state?.error ?? "the sign-in failed");
      }
    }
    case "logout": {
      const [name] = positionals;
      if (!name) throw new McpError("logout <name>");
      signOut(ROOT, name);
      console.log(`Opai is signed out of ${name}.`);
      return;
    }
    case "refresh": {
      if (values.install || values.uninstall) return scheduleRefresh(!!values.install);
      // Under launchd, the log keeps only what changed.
      const watched = process.stdout.isTTY;
      const failed: string[] = [];
      for (const result of await refreshAll(ROOT)) {
        if (result.error) failed.push(result.name);
        if (!watched && !result.renewed && !result.error) continue;
        const state = result.error
          ? `failed: ${result.error}`
          : result.renewed
            ? "renewed"
            : "still valid";
        console.log(`${watched ? "" : `${new Date().toISOString()} `}${result.name}  ${state}`);
      }
      if (failed.length > 0) {
        process.exitCode = 1;
        if (!watched) notify(`Sign in again to ${failed.join(", ")} (opai mcp login)`);
      }
      return;
    }
    case "token": {
      // Claude Code and Codex read the headers on stdout: nothing else goes there.
      const [name] = positionals;
      if (!name) throw new McpError("token <name>");
      const token = await accessToken(ROOT, name);
      process.stdout.write(
        `${JSON.stringify(token ? { Authorization: `Bearer ${token}` } : {})}\n`,
      );
      return;
    }
    default:
      console.log(USAGE);
      if (command && command !== "help") process.exitCode = 2;
  }
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof McpError || (error instanceof Error && error.name === "TypeError"))) {
    throw error;
  }
  console.error(`opai mcp: ${error.message}`);
  process.exitCode = 1;
}
