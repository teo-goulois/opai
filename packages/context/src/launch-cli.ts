// What opai adds when it starts Claude Code or Codex in the current folder:
// the space's skills (skills.ts), its MCP servers (mcp-servers.ts), their
// secrets (mcp-secrets.ts) and sign-ins (mcp-oauth.ts). On the way, the tools'
// own configs get global's servers (mcp-sync.ts), so a change pulled from
// another machine reaches the apps outside Opai here too. It prints a shell script that opai evaluates:
// warnings as `echo ... >&2`, `export NAME='value'` lines, then
// `set -- <arguments> "$@"`.
//
//   launch-cli.ts claude|codex [-- <the tool's arguments>]

import { prepareLaunch } from "./mcp-oauth.ts";
import { mcpLaunchArgs, sessionServers } from "./mcp-servers.ts";
import { syncQuietly } from "./mcp-sync.ts";
import { CLAUDE_COMMANDS, launchArgs } from "./skills.ts";
import { ROOT } from "./spaces.ts";

/** A single-quoted shell word. */
function quote(text: string) {
  return `'${text.replaceAll("'", `'\\''`)}'`;
}

const [tool, ...rest] = process.argv.slice(2);
if (tool !== "claude" && tool !== "codex") {
  console.error("usage: launch-cli.ts claude|codex [-- args]");
  process.exit(2);
}
const args = rest.filter((arg) => arg !== "--");
const cwd = process.cwd();
const session = tool === "codex" || !CLAUDE_COMMANDS.has(args[0] ?? "");
const warnings: string[] = [];
const { secrets, servers, signedIn } = prepareLaunch(
  ROOT,
  session ? sessionServers(ROOT, cwd) : {},
  process.env,
  (message) => warnings.push(message),
);
const env = { ...process.env, ...secrets };
// Without the sign-ins (Infisical unread), the configs keep what they have.
if (session && signedIn) {
  const synced = syncQuietly(ROOT, signedIn);
  if (synced.error)
    warnings.push(`opai: the tools' MCP configs were not updated (${synced.error})`);
}
const extra = [
  ...launchArgs(ROOT, tool, cwd, args),
  ...(session ? mcpLaunchArgs(ROOT, tool, cwd, env, servers) : []),
];
const lines = [
  // opai drops this program's stderr (Node's own warnings): the script says them.
  ...warnings.map((warning) => `echo ${quote(warning)} >&2`),
  ...Object.entries(secrets).map(([name, value]) => `export ${name}=${quote(value)}`),
];
if (extra.length > 0) lines.push(`set -- ${extra.map(quote).join(" ")} "$@"`);
if (lines.length > 0) process.stdout.write(`${lines.join("\n")}\n`);
