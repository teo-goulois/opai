import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";

import { makeFixture } from "./fixture.ts";
import { setModule } from "./space-edit.ts";
import { loadSpaces, readYaml, sessionContext, which } from "./spaces.ts";

const fixture = makeFixture();
after(fixture.cleanup);

const spaceOf = (folder: string) => which(fixture.root, folder)?.space.name;

test("reads the space.yaml subset", () => {
  assert.deepEqual(readYaml('name: a\nbase: true\n# note\npaths:\n  - "~/x"\n  - y\n'), {
    name: "a",
    base: true,
    paths: ["~/x", "y"],
  });
});

test("the longest claimed path wins", () => {
  assert.equal(spaceOf(join(fixture.work, "client")), "client");
  assert.equal(spaceOf(join(fixture.work, "client", "billing")), "billing");
});

test("a folder no space claims gets the default space", () => {
  mkdirSync(fixture.outside, { recursive: true });
  const match = which(fixture.root, fixture.outside);
  assert.equal(match?.space.name, "perso");
  assert.equal(match?.path, undefined);
});

test("a worktree folder counts as the same folder of the main repository", () => {
  assert.equal(spaceOf(fixture.worktree), "client");
  assert.equal(spaceOf(join(fixture.worktree, "billing")), "billing");
});

test("the hook names the space and inlines its rules, never the global ones", () => {
  const text = sessionContext(fixture.root, join(fixture.work, "client", "billing"));
  assert.match(text, /^Space of this session: billing /);
  assert.match(text, /Global modules turned off here: handbook\./);
  assert.match(text, /Invoices are in euros\./);
  assert.doesNotMatch(text, /Never shown by the hook/);
});

test("the hook points to the notes only when the space has some", () => {
  assert.match(sessionContext(fixture.root, join(fixture.work, "client")), /notes for this space/);
  assert.doesNotMatch(sessionContext(fixture.root, fixture.outside), /notes for this space/);
});

test("OPAI_HOME points the engine to an instance outside its repository", () => {
  const space = execFileSync(
    process.execPath,
    [join(import.meta.dirname, "hook.ts"), "which", join(fixture.work, "client")],
    { encoding: "utf8", env: { ...process.env, OPAI_HOME: fixture.root } },
  );
  assert.match(space, /^client /);
});

test("an empty instance has no space, and no error", () => {
  assert.equal(which(fixture.outside, fixture.work), undefined);
});

test("turns a module on and off in a space, keeping the other lines", () => {
  const file = join(fixture.root, "spaces", "billing", "space.yaml");
  const disabled = (name: string) => loadSpaces(fixture.root).find((s) => s.name === name)?.disable;
  setModule(fixture.root, "billing", "workflows", false);
  assert.deepEqual(disabled("billing"), ["handbook", "workflows"]);
  setModule(fixture.root, "billing", "handbook", true);
  setModule(fixture.root, "billing", "workflows", true);
  assert.deepEqual(disabled("billing"), []);
  assert.doesNotMatch(readFileSync(file, "utf8"), /disable/);
  assert.match(readFileSync(file, "utf8"), /paths:\n {2}- /);
  setModule(fixture.root, "billing", "handbook", false);
  assert.deepEqual(disabled("billing"), ["handbook"]);
});
