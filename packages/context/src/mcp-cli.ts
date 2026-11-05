// opai mcp: the command line of mcp-servers.ts.
//
//   opai mcp list
//   opai mcp add <name> <url> [--space s] [--header "Name: value"]...
//   opai mcp add <name> [--space s] [--env NAME=value]... -- <command> [args...]
//   opai mcp remove <name> [--space s]
//   opai mcp move <name> <space> [--from s]
//   opai mcp import [<name>...] [--space s] [--replace]
//   opai mcp check

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
import { homePath, ROOT } from "./spaces.ts";

const USAGE = `usage: opai mcp <command>

  list                                          every server, by space
  add <name> <url> [--space s] [--header "H: v"]...
  add <name> [--space s] [--env K=v]... -- <command> [args...]
                                                declare a server (global by default)
  remove <name> [--space s]                     remove it
  move <name> <space> [--from s]                move it to another space
  import [<name>...] [--space s] [--replace]    copy servers Claude Code or Codex keep
                                                in their own configs; with no name, list them
  check                                         report what is wrong

Servers of global are in every session; those of another space only in its
sessions. opai claude and opai codex load them at launch, so a change applies
from the next session. Keep secrets out: write \${NAME} and set NAME in the
environment, as "API_KEY": "\${API_KEY}" or "Authorization": "Bearer \${TOKEN}".`;

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

function main(argv: string[]) {
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
      replace: { type: "boolean" },
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
        for (const secret of source.secrets) {
          console.log(
            `  ${secret}: its value stays out of mcp.json; set ${secret} in the environment`,
          );
        }
        if (source.dropped.length > 0) console.log(`  left behind: ${source.dropped.join(", ")}`);
      }
      return;
    }
    case "check": {
      const problems = checkServers(ROOT);
      for (const problem of problems) console.log(problem);
      if (problems.length > 0) process.exitCode = 1;
      else console.log("MCP servers are in order.");
      return;
    }
    default:
      console.log(USAGE);
      if (command && command !== "help") process.exitCode = 2;
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof McpError || (error instanceof Error && error.name === "TypeError"))) {
    throw error;
  }
  console.error(`opai mcp: ${error.message}`);
  process.exitCode = 1;
}
