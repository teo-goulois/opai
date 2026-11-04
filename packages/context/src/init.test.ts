import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { createInstance, setupInstance } from "./init.ts";
import { checkSkills } from "./skills.ts";
import { ENGINE, which } from "./spaces.ts";

const base = realpathSync(mkdtempSync(join(tmpdir(), "opai-init-")));
after(() => rmSync(base, { recursive: true, force: true }));

const home = join(base, "instance");
const paths = { home, engine: ENGINE, node: process.execPath };
const json = (file: string) => JSON.parse(readFileSync(join(home, file), "utf8"));

test("init copies the template into a new folder", () => {
  assert.equal(createInstance(home), true);
  assert.equal(which(home, join(base, "anywhere"))?.space.name, "personal");
  assert.equal(createInstance(home), false);
  assert.match(readFileSync(join(home, ".gitignore"), "utf8"), /^\/codex\/\*$/m);
});

test("init refuses a folder that holds something else", () => {
  const other = join(base, "other");
  mkdirSync(other);
  writeFileSync(join(other, "notes.txt"), "mine\n");
  assert.throws(() => createInstance(other), /not empty/);
});

test("setup points the hooks and the MCP server to the engine", () => {
  setupInstance(paths);
  const hook = `OPAI_HOME="${home}" "${process.execPath}" "${join(ENGINE, "packages/context/src/hook.ts")}" session`;
  for (const settings of [json("claude/settings.json"), json("codex/hooks.json")]) {
    assert.deepEqual(settings.hooks.SessionStart, [
      { hooks: [{ type: "command", command: hook, timeout: 5 }] },
    ]);
  }
  assert.deepEqual(json("claude/settings.json").permissions.allow, ["mcp__opai"]);
  const toml = readFileSync(join(home, "codex", "config.toml"), "utf8");
  assert.match(toml, /\[mcp_servers\.opai\]/);
  assert.match(toml, new RegExp(`OPAI_HOME = "${home}"`));
  assert.equal(readlinkSync(join(home, "claude", "CLAUDE.md")), "../spaces/global/AGENTS.md");
  assert.equal(
    execFileSync("git", ["-C", home, "config", "core.hooksPath"], { encoding: "utf8" }).trim(),
    join(ENGINE, ".githooks"),
  );
  assert.deepEqual(checkSkills(home), []);
});

test("setup keeps what it does not own, and changes nothing the second time", () => {
  const settings = json("claude/settings.json");
  settings.theme = "dark";
  settings.hooks.SessionStart.unshift({ hooks: [{ type: "command", command: "echo mine" }] });
  writeFileSync(join(home, "claude", "settings.json"), JSON.stringify(settings));
  const config = join(home, "codex", "config.toml");
  writeFileSync(config, `model = "gpt"\n\n${readFileSync(config, "utf8")}`);

  setupInstance(paths);
  assert.deepEqual(setupInstance(paths).changed, []);
  const after = json("claude/settings.json");
  assert.equal(after.theme, "dark");
  assert.equal(after.hooks.SessionStart.length, 2);
  const toml = readFileSync(config, "utf8");
  assert.match(toml, /^model = "gpt"$/m);
  assert.equal(toml.match(/\[mcp_servers\.opai\]/g)?.length, 1);
});

test("the hook of a new instance names its space", () => {
  const output = execFileSync(process.execPath, [join(import.meta.dirname, "hook.ts"), "session"], {
    encoding: "utf8",
    input: JSON.stringify({ cwd: base }),
    env: { ...process.env, OPAI_HOME: home },
  });
  assert.match(JSON.parse(output).hookSpecificOutput.additionalContext, /personal/);
});
