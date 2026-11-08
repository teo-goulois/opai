import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { makeFixture } from "./fixture.ts";
import { shareAll, shareSkill, skillSharing } from "./sharing.ts";

const fixture = makeFixture();
const remote = realpathSync(mkdtempSync(join(tmpdir(), "opai-remote-")));
after(() => {
  fixture.cleanup();
  rmSync(remote, { recursive: true, force: true });
});
const { root } = fixture;

function write(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}
const git = (...args: string[]) =>
  execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: "pipe" });

function skill(space: string, name: string) {
  write(
    join(root, "spaces", space, "skills", name, "SKILL.md"),
    `---\nname: ${name}\ndescription: Does ${name}.\n---\n`,
  );
  mkdirSync(join(root, "codex", "skills"), { recursive: true });
  symlinkSync(`../../spaces/${space}/skills/${name}`, join(root, "codex", "skills", name));
}

test("no sharing without a repository", () => {
  skill("global", "shared");
  assert.equal(skillSharing(root), undefined);
});

test("no sharing without origin/main", () => {
  git("init", "-q", "-b", "main");
  git("config", "user.name", "t");
  git("config", "user.email", "t@t");
  git("config", "core.hooksPath", "/dev/null");
  git("add", "-A");
  git("commit", "-qm", "init");
  assert.equal(skillSharing(root), undefined);
});

test("each skill says whether the other machines have it", () => {
  execFileSync("git", ["init", "-q", "--bare", remote]);
  git("remote", "add", "origin", remote);
  skill("global", "changed");
  git("add", "-A");
  git("commit", "-qm", "changed");
  git("push", "-q", "origin", "main");
  write(join(root, "spaces", "global", "skills", "changed", "notes.md"), "New.\n");

  skill("perso", "pending");
  git("add", "-A", "--", "spaces/perso/skills/pending", "codex/skills/pending");
  git("commit", "-qm", "pending");

  skill("perso", "local");
  // A commit only origin/main has is not ours to push.
  git("fetch", "-q", "origin");

  const sharing = skillSharing(root);
  assert.deepEqual(Object.fromEntries(sharing ?? []), {
    "spaces/global/skills/changed": "changed",
    "spaces/global/skills/shared": "shared",
    "spaces/perso/skills/local": "local",
    "spaces/perso/skills/pending": "pending",
  });
});

test("a link left out of a commit leaves the skill changed", () => {
  rmSync(join(root, "codex", "skills", "shared"));
  assert.equal(skillSharing(root)?.get("spaces/global/skills/shared"), "changed");
  git("checkout", "-q", "--", "codex/skills/shared");
  assert.equal(skillSharing(root)?.get("spaces/global/skills/shared"), "shared");
});

test("sharing a skill commits it and its links, and nothing else", () => {
  write(join(root, "spaces", "perso", "context", "notes.md"), "Mine.\n");
  git("add", "spaces/perso/context/notes.md");

  assert.deepEqual(shareSkill(root, "local"), { name: "local", sharing: "pending" });
  assert.deepEqual(git("show", "--name-only", "--format=%s", "HEAD").trim().split("\n"), [
    "Share the local skill",
    "",
    "codex/skills/local",
    "spaces/perso/skills/local/SKILL.md",
  ]);
  assert.match(git("status", "--porcelain"), /^A {2}spaces\/perso\/context\/notes\.md$/m);
  assert.throws(() => shareSkill(root, "local"), /nothing to share/);
  assert.throws(() => shareSkill(root, "missing"), /No skill named missing/);
});

test("sharing all commits the MCP servers and the skills, and nothing else", () => {
  write(join(root, "spaces", "perso", "mcp.json"), '{ "mcpServers": {} }\n');
  assert.deepEqual(shareAll(root), [
    "spaces/global/skills/changed/notes.md",
    "spaces/perso/mcp.json",
  ]);
  assert.equal(git("log", "-1", "--format=%s").trim(), "Share MCP servers and skills");
  assert.match(git("status", "--porcelain"), /^A {2}spaces\/perso\/context\/notes\.md$/m);
  assert.equal(skillSharing(root)?.get("spaces/global/skills/changed"), "pending");
  assert.deepEqual(shareAll(root), []);
});
