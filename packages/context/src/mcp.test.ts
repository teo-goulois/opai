import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { makeFixture } from "./fixture.ts";
import { createServer } from "./mcp.ts";

const fixture = makeFixture();
after(fixture.cleanup);

async function connect(cwd: string) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ root: fixture.root, cwd }).connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  return client;
}

/** The tool's JSON answer, or its error text. */
async function ask(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { type: string; text: string }[];
  const text = content[0]?.text ?? "";
  return result.isError ? { error: text } : JSON.parse(text);
}

const client = await connect(join(fixture.work, "client"));
after(() => client.close());

test("offers exactly the listed tools; only the writing ones are not read-only", async () => {
  const { tools } = await client.listTools();
  const readOnly = Object.fromEntries(
    tools.map((tool) => [tool.name, tool.annotations?.readOnlyHint]),
  );
  assert.deepEqual(readOnly, {
    space_current: true,
    memory_search: true,
    memory_get: true,
    journal_append: false,
    issue_record: false,
  });
});

test("space_current uses the session's folder, or the one given", async () => {
  const session = await ask(client, "space_current", {});
  assert.equal(session.space, "client");
  assert.equal(session.folderFrom, "session");
  const given = await ask(client, "space_current", {
    cwd: join(fixture.work, "client", "billing"),
  });
  assert.equal(given.space, "billing");
  assert.equal(given.folderFrom, "input");
  assert.match(given.rules, /Invoices are in euros/);
});

test("memory_search finds facts of the space and of global, without accents or case", async () => {
  const { facts } = await ask(client, "memory_search", { query: "REGLE commission" });
  assert.equal(facts[0].path, "spaces/client/context/memory/facturation.md");
  assert.equal(facts[0].score, 2);
  const global = await ask(client, "memory_search", { query: "runner" });
  assert.deepEqual(
    global.facts.map((fact: { space: string }) => fact.space),
    ["global"],
  );
});

test("memory_search skips the README and links that leave the root", async () => {
  const { facts } = await ask(client, "memory_search", { query: "secret index facturation" });
  assert.deepEqual(
    facts.map((fact: { path: string }) => fact.path),
    ["spaces/client/context/memory/facturation.md"],
  );
});

test("memory_get reads a fact", async () => {
  const fact = await ask(client, "memory_get", {
    path: "spaces/client/context/memory/facturation.md",
  });
  assert.equal(fact.title, "Facturation");
  assert.match(fact.text, /4 %/);
});

test("memory_get refuses anything outside a memory folder", async () => {
  for (const path of [
    "spaces/client/context/memory/escape.md",
    "spaces/client/context/memory/../../../../secret.md",
    "spaces/client/context/notes.md",
    "spaces/billing/AGENTS.md",
    join(fixture.root, "spaces/client/context/memory/facturation.md"),
  ]) {
    const answer = await ask(client, "memory_get", { path });
    assert.match(answer.error ?? "", /not a fact/, path);
  }
  const missing = await ask(client, "memory_get", { path: "spaces/client/context/memory/none.md" });
  assert.match(missing.error, /No fact/);
});

test("invalid input is an error, not a crash", async () => {
  const answer = await ask(client, "memory_search", { query: "" });
  assert.ok(answer.error);
});

test("the real server starts over stdio in the session's folder", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(import.meta.dirname, "mcp.ts")],
    cwd: join(fixture.work, "client"),
    env: { ...getDefaultEnvironment(), OPAI_HOME: fixture.root },
    stderr: "ignore",
  });
  const real = new Client({ name: "test", version: "0" });
  await real.connect(transport);
  try {
    const { tools } = await real.listTools();
    assert.equal(tools.length, 5);
    const answer = await ask(real, "space_current", {});
    assert.equal(answer.folderFrom, "session");
    assert.ok(answer.folder.endsWith(join("work", "client")));
    assert.equal(answer.space, "client");
  } finally {
    await real.close();
  }
});

const entry = {
  project: "Acme",
  title: "Facturation à 4 %",
  status: "validated",
  relevance: "A",
  relevanceReason: "Unblocks the launch.",
  outcome: "The commission is computed by the billing service.",
  changes: ["apps/billing/src/fee.ts"],
};

test("journal_append creates one new file per call, in the session's space", async () => {
  const first = await ask(client, "journal_append", entry);
  const second = await ask(client, "journal_append", entry);
  assert.notEqual(first.path, second.path);
  assert.equal(first.space, "client");
  assert.match(
    first.path,
    /^spaces\/client\/agents\/journal\/\d{4}-\d{2}-\d{2}\/\d{2}-\d{2}-\d{2}-acme-facturation-a-4-[0-9a-f]{8}\.md$/,
  );
  const text = readFileSync(join(fixture.root, first.path), "utf8");
  assert.match(text, /^---\nproject: "Acme"\nstatus: "validated"\nrelevance: "A"\nagent: "test"\n/);
  assert.match(text, /## Changes\n\n- apps\/billing\/src\/fee.ts\n/);
  assert.match(text, /## Public sharing\n\nNone\n/);
});

test("a writing tool ignores a folder given by the agent: it writes in the session's space", async () => {
  const answer = await ask(client, "journal_append", {
    ...entry,
    cwd: join(fixture.work, "client", "billing"),
  });
  assert.equal(answer.space, "client");
  const billing = await connect(join(fixture.work, "client", "billing"));
  assert.equal((await ask(billing, "journal_append", entry)).space, "billing");
  await billing.close();
});

test("a writing tool refuses text that looks like a secret, and writes nothing", async () => {
  const before = journalFiles();
  const answer = await ask(client, "journal_append", {
    ...entry,
    outcome: "Token ghp_abcdefghijklmnopqrstuvwxyz0123456789",
  });
  assert.match(answer.error, /outcome looks like it holds a secret/);
  assert.equal(journalFiles(), before);
});

test("issue_record keeps every occurrence and counts them across spaces", async () => {
  const issue = {
    key: "Killing user processes",
    title: "Stopped the user's dev server",
    context: "ANLV, restarting the web app.",
    wrong: "Killed the server on port 4747.",
    expected: "Start another one on a free port.",
    scope: "global",
  };
  const first = await ask(client, "issue_record", issue);
  assert.equal(first.key, "killing-user-processes");
  assert.equal(first.occurrences, 1);
  const billing = await connect(join(fixture.work, "client", "billing"));
  const second = await ask(billing, "issue_record", issue);
  await billing.close();
  assert.equal(second.space, "billing");
  assert.equal(second.occurrences, 2);
  assert.match(readFileSync(join(fixture.root, second.path), "utf8"), /## What went wrong/);
});

function journalFiles() {
  const folder = join(fixture.root, "spaces", "client", "agents", "journal");
  return readdirSync(folder, { recursive: true }).length;
}
