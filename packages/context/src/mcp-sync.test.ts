import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";

import { parse as parseToml } from "smol-toml";

import { makeFixture } from "./fixture.ts";
import { addServer, findToolServers, removeServer } from "./mcp-servers.ts";
import { syncTools } from "./mcp-sync.ts";

const fixture = makeFixture();
after(fixture.cleanup);
const { root } = fixture;
const home = join(root, "..", "home-sync");
const claude = join(home, ".claude.json");
const codex = join(home, ".codex", "config.toml");

test("global's servers reach the tools' own configs, with no secret in them", () => {
  mkdirSync(join(home, ".codex"), { recursive: true });
  writeFileSync(
    claude,
    JSON.stringify(
      { numStartups: 2, mcpServers: { docs: { command: "old" }, mine: { command: "mine" } } },
      null,
      2,
    ),
  );
  writeFileSync(
    codex,
    '# mine\nmodel = "gpt"\n\n[mcp_servers.docs]\ncommand = "old"\n\n[mcp_servers.mine]\ncommand = "mine"\n',
  );
  addServer(root, "docs", { url: "https://docs.example/mcp" });
  addServer(root, "api", {
    url: "https://api.example/mcp",
    headers: { Authorization: "Bearer ${API_TOKEN}", "X-Team": "web" },
  });
  addServer(root, "tool", { command: "/bin/tool", args: ["${HOME}/data"] });
  addServer(root, "npxed", { command: "npx", args: ["-y", "thing"] });
  addServer(root, "pen", {
    command: "/bin/pen",
    args: ["--agent", "claude"],
    codex: { args: ["--agent", "codex"] },
  });
  addServer(root, "keyed", { command: "/bin/keyed", env: { KEY: "${KEY}" } });

  const signedIn = new Map([["docs", { url: "https://docs.example/mcp" }]]);
  const first = syncTools(root, signedIn, home);
  assert.deepEqual(first.changed, [claude, codex]);
  assert.deepEqual(first.skipped, []);

  const data = JSON.parse(readFileSync(claude, "utf8"));
  assert.equal(data.numStartups, 2);
  assert.deepEqual(data.mcpServers.mine, { command: "mine" });
  assert.match(data.mcpServers.docs.headersHelper, /headers 'docs'$/);
  assert.equal(data.mcpServers.docs.type, "http");
  assert.deepEqual(data.mcpServers.api.headers, { "X-Team": "web" });
  assert.match(data.mcpServers.api.headersHelper, /headers 'api'$/);
  assert.deepEqual(data.mcpServers.tool, {
    type: "stdio",
    command: "/bin/tool",
    args: [`${home}/data`],
  });
  assert.deepEqual(data.mcpServers.npxed.args.slice(-2), ["run", "npxed"]);
  assert.deepEqual(data.mcpServers.keyed.args.slice(-2), ["run", "keyed"]);
  assert.deepEqual(data.mcpServers.pen.args, ["--agent", "claude"]);
  assert.equal(data.mcpServers.pen.codex, undefined);
  assert.ok(!readFileSync(claude, "utf8").includes("API_TOKEN"));

  const text = readFileSync(codex, "utf8");
  assert.ok(text.startsWith('# mine\nmodel = "gpt"\n\n[mcp_servers.mine]\ncommand = "mine"\n'));
  const toml = parseToml(text) as { mcp_servers: Record<string, Record<string, unknown>> };
  assert.deepEqual(toml.mcp_servers.pen!.args, ["--agent", "codex"]);
  assert.match(String(toml.mcp_servers.docs!.http_headers_helper), /headers 'docs'$/);
  assert.equal(toml.mcp_servers.api!.bearer_token_env_var, undefined);
  assert.ok(!text.includes("API_TOKEN"));

  // What Opai wrote is not a copy to import or remove; the user's own servers are.
  assert.deepEqual(
    findToolServers(root, home).map((found) => found.name),
    ["mine", "mine"],
  );

  // Once written, nothing changes; a server that leaves global leaves the configs.
  assert.deepEqual(syncTools(root, signedIn, home).changed, []);
  for (const name of ["docs", "api", "tool", "npxed", "pen", "keyed"]) removeServer(root, name);
  assert.deepEqual(syncTools(root, signedIn, home).changed, [claude, codex]);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(claude, "utf8")).mcpServers), ["mine"]);
  assert.equal(
    readFileSync(codex, "utf8"),
    '# mine\nmodel = "gpt"\n\n[mcp_servers.mine]\ncommand = "mine"\n',
  );
});
