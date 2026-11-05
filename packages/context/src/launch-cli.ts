// The arguments opai adds when it starts Claude Code or Codex in the current
// folder, one per line: the space's skills (skills.ts) and MCP servers
// (mcp-servers.ts).
//
//   launch-cli.ts claude|codex [-- <the tool's arguments>]

import { mcpLaunchArgs } from "./mcp-servers.ts";
import { CLAUDE_COMMANDS, launchArgs } from "./skills.ts";
import { ROOT } from "./spaces.ts";

const [tool, ...rest] = process.argv.slice(2);
if (tool !== "claude" && tool !== "codex") {
  console.error("usage: launch-cli.ts claude|codex [-- args]");
  process.exit(2);
}
const args = rest.filter((arg) => arg !== "--");
const cwd = process.cwd();
const session = tool === "codex" || !CLAUDE_COMMANDS.has(args[0] ?? "");
const extra = [
  ...launchArgs(ROOT, tool, cwd, args),
  ...(session ? mcpLaunchArgs(ROOT, tool, cwd) : []),
];
if (extra.length > 0) process.stdout.write(`${extra.join("\n")}\n`);
