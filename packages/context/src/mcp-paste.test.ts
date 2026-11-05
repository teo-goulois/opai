import assert from "node:assert/strict";
import { homedir } from "node:os";
import { test } from "node:test";

import { guessName, parsePaste, words } from "./mcp-paste.ts";

test("shell words", () => {
  assert.deepEqual(words(`a "b c" 'd "e"' f\\ g \\\n h`), ["a", "b c", 'd "e"', "f g", "h"]);
  assert.throws(() => words(`a "b`), /unclosed/);
});

test("names from packages and URLs", () => {
  assert.equal(guessName("@stripe/mcp"), "stripe");
  assert.equal(guessName("@modelcontextprotocol/server-github"), "github");
  assert.equal(guessName("mcp-server-gsc@0.3.0"), "gsc");
  assert.equal(guessName("https://mcp.sentry.dev/mcp"), "sentry");
  assert.equal(guessName("https://api.mobbin.com/mcp"), "mobbin");
});

test("claude mcp add, its token taken out", () => {
  const [pasted] = parsePaste(
    `claude mcp add --transport http corridor https://app.corridor.dev/api/mcp --header "Authorization: Bearer abc123"`,
  );
  assert.deepEqual(pasted, {
    name: "corridor",
    server: {
      url: "https://app.corridor.dev/api/mcp",
      headers: { Authorization: "Bearer ${CORRIDOR_TOKEN}" },
    },
    secrets: { CORRIDOR_TOKEN: "abc123" },
    notes: [],
  });
  const [stdio] = parsePaste(
    `claude mcp add my-server -s user -e API_KEY=xyz MODE=fast -- npx my-mcp-server --flag`,
  );
  assert.deepEqual(stdio!.server, {
    command: "npx",
    args: ["my-mcp-server", "--flag"],
    env: { API_KEY: "${API_KEY}", MODE: "fast" },
  });
  assert.deepEqual(stdio!.secrets, { API_KEY: "xyz" });
  assert.equal(stdio!.notes.length, 1);
});

test("codex mcp add, add-json, JSON maps, a command, a URL", () => {
  assert.deepEqual(parsePaste(`codex mcp add docs --env TOKEN=t -- npx -y docs-mcp`)[0]!.server, {
    command: "npx",
    args: ["-y", "docs-mcp"],
    env: { TOKEN: "${TOKEN}" },
  });
  assert.deepEqual(
    parsePaste(`codex mcp add api --url https://api.x/mcp --bearer-token-env-var API_TOKEN`)[0]!
      .server,
    { url: "https://api.x/mcp", headers: { Authorization: "Bearer ${API_TOKEN}" } },
  );
  assert.deepEqual(
    parsePaste(`claude mcp add-json weather '{"type":"stdio","command":"weather-mcp"}'`)[0],
    { name: "weather", server: { command: "weather-mcp" }, secrets: {}, notes: [] },
  );
  const many = parsePaste(
    JSON.stringify({
      mcpServers: {
        a: { command: "a" },
        b: { type: "streamable-http", url: "https://b/mcp", disabled: false },
      },
    }),
  );
  assert.deepEqual(
    many.map((item) => [item.name, item.server, item.notes]),
    [
      ["a", { command: "a" }, []],
      ["b", { url: "https://b/mcp" }, ["disabled is not kept"]],
    ],
  );
  assert.equal(parsePaste(`{"command":"x"}`, "named")[0]!.name, "named");
  assert.equal(parsePaste("npx -y @stripe/mcp --tools=all")[0]!.name, "stripe");
  assert.deepEqual(parsePaste("https://mcp.linear.app/mcp")[0], {
    name: "linear",
    server: { url: "https://mcp.linear.app/mcp" },
    secrets: {},
    notes: [],
  });
  assert.equal(
    parsePaste(`node ${homedir()}/x/server.mjs`)[0]!.server.args![0],
    "${HOME}/x/server.mjs",
  );
  assert.throws(() => parsePaste("claude mcp list"), /does not add/);
  assert.throws(() => parsePaste(" "), /nothing/);
});
