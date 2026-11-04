import assert from "node:assert/strict";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";

import { Effect } from "effect";

import { makeFixture } from "./fixture.ts";
import { getSession, listSessions, parseClaude, parseCodex, skillsRead } from "./sessions.ts";
import type { Env } from "./origins.ts";
import { collect, countSkillUses } from "./usage.ts";

const fixture = makeFixture();
after(fixture.cleanup);

const jsonl = (rows: object[]) => rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
const cwd = join(fixture.work, "client");
const at = "2026-11-04T08:00:00.000Z";
const env: Env = {
  root: fixture.root,
  home: "/nowhere",
  ownSkills: new Set(["localify"]),
  spaces: new Set(["global", "client"]),
};
const hook = `node "${join(fixture.root, "packages", "context", "src", "hook.ts")}" session`;

const claude = jsonl([
  {
    type: "attachment",
    timestamp: at,
    cwd,
    attachment: {
      type: "prompt_snapshot",
      systemPrompt: [
        "You are Claude Code.",
        "__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__",
        "## T3 Code orchestration\nUse threads.",
      ],
      tools: [{ name: "Bash" }, { name: "Skill" }],
    },
  },
  {
    type: "attachment",
    timestamp: at,
    cwd,
    attachment: {
      type: "instructions",
      files: [
        { path: join(fixture.root, "claude", "CLAUDE.md"), content: "Be brief." },
        { path: join(cwd, "AGENTS.md"), content: "Invoices are in euros." },
      ],
    },
  },
  {
    type: "attachment",
    timestamp: at,
    cwd,
    attachment: {
      type: "hook_additional_context",
      hookEvent: "SessionStart",
      content: ["Space of this session: client"],
    },
  },
  {
    type: "attachment",
    timestamp: at,
    cwd,
    attachment: { type: "hook_success", hookEvent: "SessionStart", command: hook },
  },
  {
    type: "attachment",
    timestamp: at,
    cwd,
    attachment: {
      type: "skill_listing",
      isInitial: true,
      names: ["localify", "deploy", "anthropic-skills:pdf", "client:invoices"],
      skillCount: 4,
      content: "- localify: …\n- deploy: …\n- anthropic-skills:pdf: …\n- client:invoices: …",
    },
  },
  {
    type: "attachment",
    timestamp: at,
    cwd,
    attachment: {
      type: "deferred_tools_delta",
      addedNames: [
        "mcp__opai__journal_append",
        "mcp__t3-code__t3_thread_read",
        "mcp__claude_ai_Notion__search",
      ],
    },
  },
  {
    type: "attachment",
    timestamp: at,
    cwd,
    attachment: {
      type: "mcp_instructions_delta",
      addedNames: ["opai"],
      addedBlocks: ["## opai\nold"],
    },
  },
  {
    type: "attachment",
    timestamp: at,
    cwd,
    attachment: {
      type: "mcp_instructions_delta",
      addedNames: ["opai", "claude.ai Notion"],
      addedBlocks: ["## opai\nnew", "## claude.ai Notion\nPages."],
    },
  },
  {
    type: "user",
    timestamp: at,
    cwd,
    uuid: "u1",
    message: { role: "user", content: "<command-name>/deploy</command-name>" },
  },
  {
    type: "user",
    timestamp: at,
    cwd,
    uuid: "u2",
    message: { role: "user", content: "<command-name>/clear</command-name>" },
  },
  {
    type: "assistant",
    timestamp: at,
    cwd,
    message: {
      model: "claude-opus-5-5",
      content: [
        { type: "text", text: "On it." },
        { type: "tool_use", id: "t1", name: "Skill", input: { skill: "localify" } },
        { type: "tool_use", id: "t2", name: "Bash", input: { command: "ls" } },
      ],
    },
  },
  {
    type: "user",
    timestamp: at,
    cwd,
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "t2", content: "a\nb", is_error: false }],
    },
  },
  { type: "ai-title", aiTitle: "Deploy the client app" },
  {
    type: "user",
    timestamp: at,
    cwd,
    isSidechain: true,
    message: { role: "user", content: "a subagent's prompt" },
  },
]);

const codex = jsonl([
  {
    type: "session_meta",
    timestamp: at,
    payload: {
      id: "01a1a329-ecb2-70d0-9c7c-fdfbe269e671",
      cwd,
      originator: "codex_exec",
      base_instructions: { text: "You are Codex." },
    },
  },
  { type: "turn_context", timestamp: at, payload: { model: "gpt-6-astra", cwd } },
  {
    type: "response_item",
    timestamp: at,
    payload: {
      type: "additional_tools",
      tools: [
        {
          type: "namespace",
          name: "functions",
          tools: [{ name: "exec" }],
        },
        { type: "namespace", name: "clock", tools: [{ name: "sleep" }] },
        { type: "namespace", name: "mcp__t3_code_direct", tools: [{ name: "t3_thread_wait" }] },
      ],
    },
  },
  {
    type: "response_item",
    timestamp: at,
    payload: {
      type: "message",
      role: "developer",
      content: [{ type: "input_text", text: "You are Codex." }],
    },
  },
  {
    type: "response_item",
    timestamp: at,
    payload: {
      type: "message",
      role: "developer",
      content: [
        {
          type: "input_text",
          text: [
            "<skills_instructions>",
            "### Skill roots",
            `- \`r0\` = \`${join(fixture.root, "codex", "skills")}\``,
            `- \`r1\` = \`${join(fixture.root, "codex", "skills", ".system")}\``,
            "### Available skills",
            "- localify: Local domains. (file: r0/localify/SKILL.md)",
            "- imagegen: Images. (file: r1/imagegen/SKILL.md)",
            "</skills_instructions>",
          ].join("\n"),
        },
      ],
    },
  },
  {
    type: "response_item",
    timestamp: at,
    payload: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "# AGENTS.md instructions\n\nBe brief." }],
    },
  },
  {
    type: "response_item",
    timestamp: at,
    payload: {
      type: "message",
      role: "developer",
      content: [{ type: "input_text", text: "Space of this session: client" }],
    },
  },
  {
    type: "response_item",
    timestamp: at,
    payload: {
      type: "message",
      role: "developer",
      content: [{ type: "input_text", text: "<t3_code_orchestration_01>Use threads." }],
    },
  },
  {
    type: "response_item",
    timestamp: at,
    payload: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: `# AGENTS.md instructions for ${cwd}\n\nBe brief.` }],
    },
  },
  {
    type: "response_item",
    timestamp: at,
    payload: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "Use $localify, not $HOME" }],
    },
  },
  {
    type: "response_item",
    timestamp: at,
    payload: {
      type: "custom_tool_call",
      call_id: "c1",
      name: "exec",
      input: `tools.exec_command({cmd:"sed -n 1,80p ${join(fixture.root, "codex", "skills", "localify", "SKILL.md")}"}); tools.exec_command({cmd:"cat ~/elsewhere/unslop/SKILL.md"})`,
    },
  },
  {
    type: "response_item",
    timestamp: at,
    payload: {
      type: "custom_tool_call_output",
      call_id: "c1",
      output: [{ type: "input_text", text: "# Localify" }],
    },
  },
  {
    type: "response_item",
    timestamp: at,
    payload: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "# AGENTS.md instructions\n\nBe brief." }],
    },
  },
]);

test("reads what a Claude session was given and did", () => {
  const session = parseClaude("s1", claude, env);
  assert.equal(session.title, "Deploy the client app");
  assert.equal(session.model, "claude-opus-5-5");
  const origins = (index: number) =>
    session.context[index]!.sources.map((source) => [source.origin, source.name, source.count]);
  assert.deepEqual(
    session.context.map((part) => [
      part.label,
      part.sources
        .map((source) => source.origin)
        .sort()
        .join(" "),
    ]),
    [
      ["System prompt", "claude-code"],
      ["Added to the system prompt", "t3-code"],
      [join(fixture.root, "claude", "CLAUDE.md").replace(process.env.HOME ?? "", "~"), "opai"],
      [join(cwd, "AGENTS.md").replace(process.env.HOME ?? "", "~"), "project"],
      ["Hook SessionStart", "opai"],
      ["Skills (4)", "account claude-code opai opai"],
      ["MCP instructions (2)", "account opai"],
      ["Tools (5)", "account claude-code opai t3-code"],
    ].map(([label, from]) => [label, from]),
  );
  assert.deepEqual(
    origins(5).find((source) => source[0] === "account"),
    ["account", "claude.ai", 1],
  );
  assert.match(session.context[6]!.text, /new/);
  assert.match(session.context[6]!.text, /^## Account · claude\.ai \(1\)/m);
  assert.deepEqual(session.tools, [
    "Bash",
    "Skill",
    "mcp__opai__journal_append",
    "mcp__t3-code__t3_thread_read",
    "mcp__claude_ai_Notion__search",
  ]);
  assert.deepEqual([...new Set(session.origins.map((source) => source.origin))].sort(), [
    "account",
    "claude-code",
    "opai",
    "project",
    "t3-code",
  ]);
  const bash = session.steps.find((step) => step.kind === "tool" && step.name === "Bash");
  assert.equal(bash?.kind === "tool" && bash.output, "a\nb");
  assert.equal(session.prompts, 2, "the subagent's prompt is left out");
  // /deploy is a listed skill, /clear a built-in command.
  assert.deepEqual(
    session.uses.map((use) => [use.skill, use.trigger]),
    [
      ["deploy", "user"],
      ["localify", "model"],
    ],
  );
});

test("reads what a Codex session was given and did", () => {
  const session = parseCodex("01a1a329-ecb2-70d0-9c7c-fdfbe269e671", codex, env);
  assert.equal(session.title, "Use $localify, not $HOME");
  assert.equal(session.client, "codex_exec");
  assert.deepEqual(
    session.context.map((part) => part.label),
    [
      "Base instructions",
      "Skills (2)",
      "AGENTS.md (global)",
      "Hook SessionStart",
      "t3 code orchestration",
      `AGENTS.md of ${cwd.replace(process.env.HOME ?? "", "~")}`,
      "Tools (3)",
    ],
    "the developer copy of the base instructions is left out",
  );
  assert.deepEqual(
    session.context.map((part) => part.sources.map((source) => source.origin).join(" ")),
    ["codex", "codex opai", "opai", "opai", "t3-code", "project", "codex t3-code"],
  );
  assert.deepEqual(session.tools, ["exec", "clock.sleep", "mcp__t3_code_direct.t3_thread_wait"]);
  assert.equal(
    session.steps.filter((step) => step.kind === "context").length,
    0,
    "a repeated AGENTS.md is not news",
  );
  assert.deepEqual(
    session.uses.map((use) => [use.skill, use.trigger]),
    [
      ["localify", "user"],
      ["localify", "model"],
    ],
  );
});

test("lists the sessions of claude/ and codex/, and records their skill uses once", async () => {
  const claudeFile = join(
    fixture.root,
    "claude",
    "projects",
    "-work-client",
    "6d1c2b8e-0000-4000-8000-000000000001.jsonl",
  );
  const codexFile = join(
    fixture.root,
    "codex",
    "sessions",
    "2026",
    "11",
    "04",
    "rollout-2026-11-04T08-00-00-01a1a329-ecb2-70d0-9c7c-fdfbe269e671.jsonl",
  );
  for (const [path, text] of [
    [claudeFile, claude],
    [codexFile, codex],
  ] as const) {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, text);
  }

  const sessions = await Effect.runPromise(listSessions(fixture.root));
  assert.deepEqual(sessions.map((session) => session.harness).sort(), ["claude", "codex"]);
  assert.ok(sessions.every((session) => session.space === "client"));
  const detail = await Effect.runPromise(
    getSession(fixture.root, "01a1a329-ecb2-70d0-9c7c-fdfbe269e671"),
  );
  assert.equal(
    detail.file,
    "codex/sessions/2026/11/04/rollout-2026-11-04T08-00-00-01a1a329-ecb2-70d0-9c7c-fdfbe269e671.jsonl",
  );

  assert.deepEqual(await collect(fixture.root), { added: 4, removed: 0 });
  assert.deepEqual(
    await collect(fixture.root),
    { added: 0, removed: 0 },
    "a second run adds nothing",
  );
  rmSync(join(fixture.root, ".local"), { recursive: true });
  assert.deepEqual(
    await collect(fixture.root),
    { added: 0, removed: 0 },
    "a full rereading adds nothing either",
  );
  const usage = join(fixture.root, "spaces", "client", "agents", "usage");
  const [file] = readdirSync(usage);
  const lines = readFileSync(join(usage, file!), "utf8").trim().split("\n");
  assert.equal(lines.length, 4);

  // A use recorded under older, looser rules, which the session no longer shows.
  const stale = {
    ...JSON.parse(lines[0]!),
    id: "c1:changelog",
    skill: "changelog",
    session: "a-session-no-longer-on-disk",
  };
  writeFileSync(join(usage, file!), `${lines.join("\n")}\n${JSON.stringify(stale)}\n`);
  rmSync(join(fixture.root, ".local"), { recursive: true });
  assert.deepEqual(
    await collect(fixture.root),
    { added: 0, removed: 0 },
    "kept: its session is not here to read again",
  );
  stale.session = "01a1a329-ecb2-70d0-9c7c-fdfbe269e671";
  writeFileSync(join(usage, file!), `${lines.join("\n")}\n${JSON.stringify(stale)}\n`);
  rmSync(join(fixture.root, ".local"), { recursive: true });
  assert.deepEqual(await collect(fixture.root), { added: 0, removed: 1 });

  const counts = await Effect.runPromise(countSkillUses(fixture.root));
  assert.deepEqual(
    counts.map((count) => [count.skill, count.uses, count.byUser]),
    [
      ["localify", 3, 1],
      ["deploy", 1, 1],
    ],
  );
});

test("reading a SKILL.md elsewhere than where the session listed it is not a use", () => {
  const listed = new Map([
    ["/r/codex/skills/x/SKILL.md", "x"],
    ["r0/x/SKILL.md", "x"],
  ]);
  assert.deepEqual(skillsRead("sed -n 1,80p /r/codex/skills/x/SKILL.md", listed), ["x"]);
  assert.deepEqual(skillsRead("cat r0/x/SKILL.md", listed), ["x"]);
  assert.deepEqual(skillsRead("cat skills/x/SKILL.md", listed, "/r/codex"), ["x"]);
  assert.deepEqual(skillsRead("cat /other/copy/x/SKILL.md; rg -l SKILL.md", listed), []);
});
