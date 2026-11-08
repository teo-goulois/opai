import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { makeFixture } from "./fixture.ts";
import { syncNow } from "./sync-now.ts";

// The sync rewrites the tools' configs in the home folder: never the real one.
const home = realpathSync(mkdtempSync(join(tmpdir(), "opai-home-")));
process.env.HOME = home;
const fixture = makeFixture();
const remote = realpathSync(mkdtempSync(join(tmpdir(), "opai-remote-")));
after(() => {
  fixture.cleanup();
  rmSync(remote, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});
const { root } = fixture;
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: "pipe" });

test("syncing now commits the MCP servers, then pushes and pulls", async () => {
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "t");
  git(root, "config", "user.email", "t@t");
  git(root, "config", "core.hooksPath", "/dev/null");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "init");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
  git(root, "remote", "add", "origin", remote);
  git(root, "push", "-q", "origin", "main");

  // Another machine pushed meanwhile.
  const other = join(home, "other");
  execFileSync("git", ["clone", "-q", remote, other]);
  writeFileSync(join(other, "README.md"), "From the other machine.\n");
  git(other, "add", "README.md");
  git(other, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "other");
  git(other, "push", "-q", "origin", "main");

  mkdirSync(join(root, "spaces", "global"), { recursive: true });
  writeFileSync(join(root, "spaces", "global", "mcp.json"), '{ "mcpServers": {} }\n');

  const result = await syncNow(root);
  assert.equal(result.problem, undefined);
  assert.deepEqual(result.shared, ["spaces/global/mcp.json"]);
  assert.equal(result.pulled, 1);
  assert.ok(result.pushed >= 1);
  assert.match(git(remote, "log", "--format=%s", "main"), /^Share MCP servers and skills$/m);
  assert.equal(git(root, "status", "--porcelain", "--", "spaces/global/mcp.json"), "");
});
