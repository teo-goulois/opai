import assert from "node:assert/strict";
import { lstatSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";

import { Effect } from "effect";

import { makeFixture } from "./fixture.ts";
import { getHarnessFile, getHarnessLayout, updateHarnessFile } from "./harness.ts";
import { appendJournal, recordIssue } from "./records.ts";
import { getRule, listRules, updateRule } from "./rules.ts";
import { getSpace, listSpaces } from "./space-view.ts";

const fixture = makeFixture();
after(fixture.cleanup);
const run = Effect.runPromise;
const by = { agent: "test", machine: "here" };

test("a space shows its facts, journal and issues, with issue counts across spaces", async () => {
  await run(
    appendJournal(
      fixture.root,
      "client",
      {
        project: "Acme",
        title: "Fee",
        status: "validated",
        relevance: "A",
        relevanceReason: "launch",
        outcome: "Done.",
      },
      by,
    ),
  );
  const issue = {
    key: "same-key",
    title: "Again",
    context: "c",
    wrong: "w",
    expected: "e",
    scope: "global" as const,
  };
  await run(recordIssue(fixture.root, "client", issue, by));
  await run(recordIssue(fixture.root, "billing", issue, by));

  const space = await run(getSpace(fixture.root, "client"));
  assert.deepEqual(space.counts, { rules: 0, facts: 1, journal: 1, issues: 1 });
  assert.equal(space.facts[0]?.title, "Facturation");
  assert.equal(space.journal[0]?.title, "Fee");
  assert.equal(space.journal[0]?.status, "validated");
  assert.equal(space.journal[0]?.agent, "test");
  assert.match(space.journal[0]?.body ?? "", /## Outcome\n\nDone\./);
  assert.equal(space.issues[0]?.occurrences, 2);

  const list = await run(listSpaces(fixture.root));
  assert.deepEqual(
    list.map((summary) => [summary.name, summary.counts.issues]),
    [
      ["billing", 1],
      ["client", 1],
      ["global", 0],
      ["perso", 0],
    ],
  );
});

test("rules list each space's AGENTS.md and modules; an edit needs the current hash", async () => {
  writeFileSync(join(fixture.root, "spaces", "global", "README.md"), "not a rule\n");
  const rules = await run(listRules(fixture.root));
  assert.deepEqual(rules.map((rule) => rule.id).sort(), ["billing-agents", "global-agents"]);
  const rule = await run(getRule(fixture.root, "billing-agents"));
  await assert.rejects(run(updateRule(fixture.root, rule.id, "# New\n", "stale")), /StaleWrite/);
  const saved = await run(updateRule(fixture.root, rule.id, "# New\n", rule.hash));
  assert.equal(saved.title, "New");
});

test("harness files: links shown as links, JSON checked, a link is never replaced", async () => {
  mkdirSync(join(fixture.root, "claude"), { recursive: true });
  mkdirSync(join(fixture.root, "codex"), { recursive: true });
  symlinkSync("../spaces/global/AGENTS.md", join(fixture.root, "claude", "CLAUDE.md"));
  writeFileSync(join(fixture.root, "elsewhere.json"), "{}\n");
  symlinkSync("../elsewhere.json", join(fixture.root, "codex", "hooks.json"));

  const layout = await run(getHarnessLayout(fixture.root));
  assert.deepEqual(layout.instructions, [
    { tool: "claude", path: "claude/CLAUDE.md", target: "spaces/global/AGENTS.md" },
    { tool: "codex", path: "codex/AGENTS.md", target: null },
  ]);

  const settings = await run(getHarnessFile(fixture.root, "claude/settings.json"));
  assert.equal(settings.exists, false);
  await assert.rejects(
    run(updateHarnessFile(fixture.root, settings.path, "{ nope", settings.hash)),
    /not valid JSON/,
  );
  const created = await run(
    updateHarnessFile(fixture.root, settings.path, '{"a":1}\n', settings.hash),
  );
  assert.equal(created.exists, true);

  const hooks = await run(getHarnessFile(fixture.root, "codex/hooks.json"));
  await assert.rejects(
    run(updateHarnessFile(fixture.root, hooks.path, '{"b":2}\n', hooks.hash)),
    /is a link/,
  );
  assert.ok(lstatSync(join(fixture.root, "codex", "hooks.json")).isSymbolicLink());
});
