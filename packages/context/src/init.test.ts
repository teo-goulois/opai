import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
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
const tools = { claude: join(base, "dot-claude"), codex: join(base, "dot-codex") };
const paths = { home, engine: ENGINE, node: process.execPath, tools };
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

test("setup points the hooks and the MCP server to the engine, through this machine's links", () => {
  setupInstance(paths);
  assert.equal(readlinkSync(join(home, ".local", "node")), process.execPath);
  assert.equal(readlinkSync(join(home, ".local", "engine")), ENGINE);
  const hook = `OPAI_HOME="${home}" "${home}/.local/node" "${home}/.local/engine/packages/context/src/hook.ts" session`;
  for (const settings of [json("claude/settings.json"), json("codex/hooks.json")]) {
    assert.deepEqual(settings.hooks.SessionStart, [
      { hooks: [{ type: "command", command: hook, timeout: 5 }] },
    ]);
  }
  assert.deepEqual(json("claude/settings.json").permissions.allow, ["mcp__opai"]);
  const toml = readFileSync(join(home, "codex", "config.toml"), "utf8");
  assert.match(toml, /\[mcp_servers\.opai\]/);
  const args = toml.match(/^args = (\[.*\])$/m)?.[1];
  assert.deepEqual(JSON.parse(args ?? "[]"), [
    "-c",
    `OPAI_HOME="${home}" exec "${home}/.local/node" "${home}/.local/engine/packages/context/src/mcp.ts"`,
  ]);
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

test("the hook of a new instance names its space, run as the config writes it", () => {
  const { command } = json("codex/hooks.json").hooks.SessionStart[0].hooks[0];
  const output = execFileSync("/bin/sh", ["-c", command], {
    encoding: "utf8",
    input: JSON.stringify({ cwd: base }),
  });
  assert.match(JSON.parse(output).hookSpecificOutput.additionalContext, /personal/);
});

test("an instance in the home folder is named from $HOME, the same on every machine", () => {
  const saved = process.env.HOME;
  process.env.HOME = base;
  try {
    const shared = join(base, "shared");
    createInstance(shared);
    setupInstance({ ...paths, home: shared });
    const { command } = JSON.parse(readFileSync(join(shared, "claude", "settings.json"), "utf8"))
      .hooks.SessionStart[0].hooks[0];
    assert.match(command, /^OPAI_HOME="\$HOME\/shared" "\$HOME\/shared\/\.local\/node" /);
    const output = execFileSync("/bin/sh", ["-c", command], {
      encoding: "utf8",
      input: JSON.stringify({ cwd: base }),
      env: { ...process.env, HOME: base },
    });
    assert.match(JSON.parse(output).hookSpecificOutput.additionalContext, /personal/);
  } finally {
    process.env.HOME = saved;
  }
});

test("setup shares the transcripts with the tools' own folders, keeping every line", () => {
  const ours = join(home, "claude", "projects");
  const theirs = join(tools.claude, "projects");
  rmSync(ours);
  mkdirSync(join(ours, "work"), { recursive: true });
  writeFileSync(join(ours, "work", "a.jsonl"), "old\n");
  writeFileSync(join(ours, "work", "b.jsonl"), "only ours\n");
  mkdirSync(join(theirs, "work"), { recursive: true });
  writeFileSync(join(theirs, "work", "a.jsonl"), "new\n");

  assert.deepEqual(setupInstance(paths).changed, [
    `claude/projects → ${theirs} (shared with plain claude)`,
  ]);
  assert.equal(readlinkSync(ours), theirs);
  assert.equal(readFileSync(join(theirs, "work", "a.jsonl"), "utf8"), "old\nnew\n");
  assert.equal(readFileSync(join(theirs, "work", "b.jsonl"), "utf8"), "only ours\n");
  assert.deepEqual(
    readdirSync(join(home, "claude")).filter((name) => name.includes("moving")),
    [],
  );
  assert.equal(readlinkSync(join(home, "codex", "sessions")), join(tools.codex, "sessions"));
  assert.deepEqual(setupInstance(paths).changed, []);
});

test("setup on another machine only moves its links", () => {
  const other = { ...paths, node: join(base, "other-node") };
  writeFileSync(other.node, "");
  const before = readFileSync(join(home, "claude", "settings.json"), "utf8");
  assert.deepEqual(setupInstance(other).changed, [`.local/node → ${other.node} (this machine's)`]);
  assert.equal(readFileSync(join(home, "claude", "settings.json"), "utf8"), before);
  setupInstance(paths);
});
