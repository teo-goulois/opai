import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { makeFixture } from "./fixture.ts";
import { listMachines, readStates, reportState, thisMachine } from "./machines.ts";

const fixture = makeFixture();
const remote = realpathSync(mkdtempSync(join(tmpdir(), "opai-remote-")));
after(() => {
  fixture.cleanup();
  rmSync(remote, { recursive: true, force: true });
});
const { root } = fixture;
const here = thisMachine();
const states = join(root, "spaces", "global", "agents", "machines");

function write(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}
const git = (...args: string[]) =>
  execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: "pipe" });
const skill = (space: string, name: string) =>
  write(
    join(root, "spaces", space, "skills", name, "SKILL.md"),
    `---\nname: ${name}\ndescription: Does ${name}.\n---\n`,
  );

test("no state without a remote to share through", () => {
  assert.equal(reportState(root, "laptop"), false);
});

test("a machine reports its unshared skills, and only when they change", () => {
  skill("global", "shared");
  skill("global", "edited");
  execFileSync("git", ["init", "-q", "--bare", remote]);
  git("init", "-q", "-b", "main");
  git("config", "user.name", "t");
  git("config", "user.email", "t@t");
  git("config", "core.hooksPath", "/dev/null");
  git("remote", "add", "origin", remote);
  git("add", "-A");
  git("commit", "-qm", "init");
  git("push", "-q", "origin", "main");
  skill("perso", "draft");
  write(join(root, "spaces", "global", "skills", "edited", "notes.md"), "New.\n");

  assert.equal(reportState(root, "laptop"), true);
  assert.deepEqual(JSON.parse(readFileSync(join(states, "laptop.json"), "utf8")), {
    machine: "laptop",
    skills: { edited: "changed", draft: "local" },
  });
  assert.equal(reportState(root, "laptop"), false);
});

test("the machines page lists every machine the instance knows", async () => {
  write(
    join(states, "runner.json"),
    JSON.stringify({ machine: "runner", skills: { remote: "local" } }),
  );
  write(join(states, "broken.json"), "{");
  const use = (skill: string, machine: string) =>
    JSON.stringify({ id: `${skill}-${Math.random()}`, skill, machine, ts: "2026-11-01T10:00:00Z" });
  write(
    join(root, "spaces", "perso", "agents", "usage", "runner.jsonl"),
    [use("perso:draft", "runner"), use("draft", "runner"), use("shared", "runner")].join("\n"),
  );
  git("add", "-A", "--", "spaces/global/agents", "spaces/perso/agents");
  git("commit", "-qm", "Agents on runner: spaces/perso/agents/usage/runner.jsonl");
  write(join(root, "machines.json"), JSON.stringify({ machines: [{ name: "mini", ssh: "mini" }] }));

  assert.deepEqual([...readStates(root).keys()].sort(), ["laptop", "runner"]);
  const machines = await listMachines(root);
  assert.deepEqual(
    machines.map((machine) => machine.name),
    [here, ...["laptop", "mini", "runner"].filter((name) => name !== here)],
  );
  assert.deepEqual(machines[0]!.unshared, { edited: "changed", draft: "local" });
  const runner = machines.find((machine) => machine.name === "runner")!;
  assert.equal(runner.current, false);
  assert.deepEqual(runner.unshared, { remote: "local" });
  assert.equal(runner.uses, 3);
  assert.deepEqual(runner.skills, [
    { skill: "draft", uses: 2 },
    { skill: "shared", uses: 1 },
  ]);
  assert.match(runner.lastActivity ?? "", /^\d{4}-\d{2}-\d{2}T/);
  const mini = machines.find((machine) => machine.name === "mini")!;
  assert.equal(mini.declared, true);
  assert.equal(mini.unshared, undefined);
  assert.equal(mini.lastActivity, undefined);
});
