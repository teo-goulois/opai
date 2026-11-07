import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { makeFixture } from "./fixture.ts";
import {
  addServer,
  checkServers,
  codexServer,
  findToolServers,
  importServers,
  inlineToml,
  listProjectServers,
  listServers,
  mcpFile,
  mcpLaunchArgs,
  moveServer,
  projectOf,
  removeServer,
  sessionServers,
} from "./mcp-servers.ts";

const fixture = makeFixture();
after(fixture.cleanup);
const { root, work, outside } = fixture;
const client = join(work, "client");
const base = dirname(root);

function write(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

test("add, list, move and remove servers by space", () => {
  addServer(root, "docs", { url: "https://docs.example/mcp" });
  addServer(root, "stripe", { command: "npx", args: ["-y", "stripe-mcp"] }, { space: "client" });
  assert.deepEqual(
    listServers(root).map((entry) => `${entry.space}/${entry.name}`),
    ["global/docs", "client/stripe"],
  );
  assert.throws(() => addServer(root, "docs", { url: "https://other" }), /already in global/);
  assert.throws(() => addServer(root, "x", { url: "https://x" }, { space: "nope" }), /no space/);
  assert.throws(() => addServer(root, "opai", { url: "https://x" }), /opai setup/);
  assert.throws(() => addServer(root, "a.b", { url: "https://x" }), /characters/);
  assert.throws(() => addServer(root, "both", { url: "https://x", command: "y" }), /either/);

  moveServer(root, "stripe", "billing");
  assert.equal(existsSync(mcpFile(root, "client")), false);
  assert.deepEqual(JSON.parse(readFileSync(mcpFile(root, "billing"), "utf8")).mcpServers.stripe, {
    command: "npx",
    args: ["-y", "stripe-mcp"],
  });
  removeServer(root, "stripe");
  assert.deepEqual(
    listServers(root).map((entry) => entry.name),
    ["docs"],
  );
});

test("a literal secret is refused, a ${NAME} is not", () => {
  assert.throws(
    () => addServer(root, "leak", { url: "https://x", headers: { Authorization: "Bearer abc" } }),
    /literal value/,
  );
  assert.throws(
    () => addServer(root, "leak", { command: "x", env: { API_KEY: "abc" } }, { space: "perso" }),
    /API_KEY holds a literal value/,
  );
  addServer(
    root,
    "safe",
    { command: "x", env: { API_KEY: "${API_KEY}", MODE: "fast" } },
    { space: "perso" },
  );
  removeServer(root, "safe");
});

test("a session gets the global servers and its space's, the space's winning", () => {
  addServer(root, "docs", { url: "https://client-docs.example/mcp" }, { space: "client" });
  assert.deepEqual(sessionServers(root, join(client, "src")), {
    docs: { url: "https://client-docs.example/mcp" },
  });
  assert.deepEqual(sessionServers(root, outside), { docs: { url: "https://docs.example/mcp" } });
  removeServer(root, "docs", "client");
  assert.throws(() => removeServer(root, "missing"), /no server/);
});

test("Claude Code gets one config file per space", () => {
  addServer(root, "tracker", { command: "tracker-mcp" }, { space: "client" });
  const args = mcpLaunchArgs(root, "claude", client);
  assert.deepEqual(args, [`--mcp-config=${join(root, ".local", "mcp", "client.json")}`]);
  const config = JSON.parse(readFileSync(args[0]!.slice("--mcp-config=".length), "utf8"));
  assert.deepEqual(config.mcpServers, {
    docs: { type: "http", url: "https://docs.example/mcp" },
    tracker: { type: "stdio", command: "tracker-mcp" },
  });
  removeServer(root, "tracker");
});

test("Codex gets one -c per server, secrets read from the environment", () => {
  const env = { HOME: "/home/t", REGION: "eu" };
  assert.deepEqual(
    codexServer(
      {
        command: "${HOME}/bin/mcp",
        args: ["--region", "${REGION}", "--tier", "${TIER:-free}"],
        env: { API_KEY: "${API_KEY}", BASE: "${HOME}/data" },
      },
      env,
    ),
    {
      command: "/home/t/bin/mcp",
      args: ["--region", "eu", "--tier", "free"],
      env: { BASE: "/home/t/data" },
      env_vars: ["API_KEY"],
    },
  );
  assert.deepEqual(
    codexServer(
      {
        url: "https://api.example/mcp",
        headers: { Authorization: "Bearer ${TOKEN}", "X-Team": "${TEAM}", "X-Mode": "read" },
      },
      env,
    ),
    {
      url: "https://api.example/mcp",
      bearer_token_env_var: "TOKEN",
      env_http_headers: { "X-Team": "TEAM" },
      http_headers: { "X-Mode": "read" },
    },
  );
  assert.equal(codexServer({ type: "sse", url: "https://x" }, env), undefined);
  assert.equal(
    inlineToml({ command: 'a "b"', args: ["c"], env: { "X-Y": "z" } }),
    '{command="a \\"b\\"",args=["c"],env={X-Y="z"}}',
  );
  assert.deepEqual(mcpLaunchArgs(root, "codex", outside), [
    "-c",
    'mcp_servers.docs={url="https://docs.example/mcp"}',
  ]);
});

test("import copies a server from the tools' configs, its secrets left behind", () => {
  const home = join(base, "home");
  write(
    join(home, ".claude.json"),
    JSON.stringify({
      mcpServers: {
        opai: { command: "node" },
        sentry: {
          type: "http",
          url: "https://sentry.example/mcp",
          headers: { Authorization: "Bearer s3cret" },
        },
      },
      projects: {
        [client]: {
          mcpServers: {
            crm: { type: "stdio", command: join(homedir(), "bin", "crm"), args: [], env: {} },
            desk: {
              type: "http",
              url: "https://desk/mcp",
              headersHelper: `${join(homedir(), "bin", "auth")} desk`,
            },
          },
        },
      },
    }),
  );
  write(
    join(home, ".codex", "config.toml"),
    '[mcp_servers.gsc]\ncommand = "npx"\nargs = ["-y", "gsc"]\nenv_vars = ["GSC_KEY"]\nstartup_timeout_sec = 60.0\n',
  );
  assert.deepEqual(
    findToolServers(root, home).map(
      (found) => `${found.name} ${found.where.includes("(") ? "project" : "user"}`,
    ),
    ["sentry user", "crm project", "desk project", "gsc user"],
  );
  const [sentry, gsc, crm, desk] = importServers(root, ["sentry", "gsc", "crm", "desk"], {
    space: "client",
    home,
  });
  assert.deepEqual(crm!.server, { command: "${HOME}/bin/crm" });
  assert.deepEqual(sentry!.server, {
    url: "https://sentry.example/mcp",
    headers: { Authorization: "Bearer ${SENTRY_TOKEN}" },
  });
  assert.deepEqual(sentry!.source.secrets, { SENTRY_TOKEN: "s3cret" });
  assert.deepEqual(gsc!.server, {
    command: "npx",
    args: ["-y", "gsc"],
    env: { GSC_KEY: "${GSC_KEY}" },
  });
  assert.deepEqual(gsc!.source.dropped, ["startup_timeout_sec"]);
  assert.ok(!readFileSync(mcpFile(root, "client"), "utf8").includes("s3cret"));
  removeServer(root, "sentry");
  removeServer(root, "gsc");
  assert.deepEqual(desk!.server, {
    url: "https://desk/mcp",
    headersHelper: "${HOME}/bin/auth desk",
  });
  assert.deepEqual(codexServer(desk!.server, { HOME: "/home/me" }), {
    url: "https://desk/mcp",
    http_headers_helper: "/home/me/bin/auth desk",
  });
  removeServer(root, "crm");
  removeServer(root, "desk");
});

test("check reports broken files, unset variables and servers defined twice", () => {
  write(mcpFile(root, "billing"), "{ not json");
  addServer(
    root,
    "keyed",
    { url: "https://k", headers: { Authorization: "Bearer ${UNSET_TOKEN}" } },
    { space: "perso" },
  );
  write(
    join(root, "claude", ".claude.json"),
    JSON.stringify({ mcpServers: { docs: { type: "http", url: "https://docs.example/mcp" } } }),
  );
  const problems = checkServers(root, {});
  assert.ok(problems.some((problem) => problem.includes("billing/mcp.json")));
  assert.ok(
    problems.includes("perso/keyed: ${UNSET_TOKEN} is in neither Infisical nor the environment"),
  );
  assert.ok(problems.some((problem) => problem.startsWith("docs is also in")));
  assert.deepEqual(
    listServers(root).map((entry) => entry.name),
    ["docs", "keyed"],
  );
});

test("a project's .mcp.json serves the sessions of that project, over its space's servers", () => {
  const app = join(client, "app");
  addServer(root, "docs", { url: "https://docs.example/mcp" }, { replace: true });
  write(
    join(app, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        docs: { type: "http", url: "https://app.example/docs" },
        crm: {
          url: "https://crm.example/mcp",
          headers: { "X-Key": "literal-is-the-project's-call" },
        },
        "bad.name": { url: "https://x" },
      },
    }),
  );
  assert.equal(projectOf(join(app, "src"), base), app);
  assert.equal(projectOf(join(client, "src"), base), undefined);
  assert.equal(projectOf(outside), undefined);
  assert.deepEqual(
    listProjectServers(root).map((entry) => `${entry.space} ${entry.project} ${entry.name}`),
    [`client ${app} docs`, `client ${app} crm`],
  );
  const servers = sessionServers(root, join(app, "src"), base);
  assert.equal(servers.docs!.url, "https://app.example/docs");
  assert.equal(servers.crm!.url, "https://crm.example/mcp");
  assert.equal(sessionServers(root, client, base).crm, undefined);
  assert.equal(sessionServers(root, client, base).docs!.url, "https://docs.example/mcp");
});
