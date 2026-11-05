// The sessions Claude Code and Codex record in claude/projects/ and
// codex/sessions/, read back for the app's Sessions page: what each agent was
// given at the start (system prompt, instruction files, hook context, skills,
// tools), then what it did (prompts, replies, tool calls), and the skills it
// used. Nothing here writes: usage.ts keeps the skill uses.
//
// A session can start subagents. Claude Code writes each one next to its
// session, in <session>/subagents/agent-<id>.jsonl with a .meta.json (its type,
// the description it was given, the tool call that started it). Codex writes a
// session of its own, whose session_meta names the parent thread. Both are
// shown inside the session that started them, not in the list.

import { open, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import { Data, Effect } from "effect";
import { z } from "zod";

import {
  claudeSkillOrigin,
  codexSkillOrigin,
  commandOrigin,
  fileOrigin,
  machineEnv,
  mcpOrigin,
  originTitle,
  toolOrigin,
  totalSources,
  type Attribution,
  type Env,
  type Source,
} from "./origins.ts";
import { homePath, which } from "./spaces.ts";

export class SessionNotFound extends Data.TaggedError("SessionNotFound")<{ id: string }> {}

export class SessionsUnreadable extends Data.TaggedError("SessionsUnreadable")<{
  path: string;
  cause: unknown;
}> {}

export type Harness = "claude" | "codex";

export const SessionId = z.string().regex(/^[A-Za-z0-9-]{8,80}$/, "A session id");

export type ContextPart = {
  kind: "system" | "instructions" | "hook" | "skills" | "tools" | "mcp" | "message" | "other";
  label: string;
  /** The file it comes from, for an instruction file. */
  file?: string | undefined;
  text: string;
  chars: number;
  /** Who put it there; a list (skills, tools) can have several. */
  sources: Source[];
};

export type Step =
  | { kind: "prompt" | "reply"; at: string | undefined; text: string }
  | { kind: "context"; at: string | undefined; label: string; text: string }
  | {
      kind: "tool";
      at: string | undefined;
      id: string;
      name: string;
      input: string;
      output?: string | undefined;
      error?: boolean | undefined;
      /** The subagent this call started. */
      agent?: string | undefined;
    };

export type SkillUse = {
  /** Unique across sessions: the tool call or prompt it comes from. */
  id: string;
  ts: string;
  skill: string;
  agent: "claude-code" | "codex";
  /** model: the agent loaded it; user: I asked for it (/skill or $skill). */
  trigger: "model" | "user";
  session: string;
  cwd?: string | undefined;
};

export type SessionSummary = {
  id: string;
  harness: Harness;
  /** Path of the session file, from the instance. */
  file: string;
  title: string;
  cwd: string | undefined;
  space: string | undefined;
  model: string | undefined;
  /** The program that ran the session: T3 Code, codex_exec, the terminal... */
  client: string | undefined;
  startedAt: string | undefined;
  /** The time of its last prompt, reply or tool call. */
  endedAt: string | undefined;
  updatedAt: string;
  prompts: number;
  toolCalls: number;
  skills: string[];
  /** Characters of everything given at the start, a rough size of the context. */
  contextChars: number;
  /** For a subagent: the session that started it, and its type (Explore, a Codex role). */
  parent: string | undefined;
  agentType: string | undefined;
  /** How many subagents it started. */
  subagents: number;
};

export type SessionDetail = SessionSummary & {
  context: ContextPart[];
  /** Everything given at the start, added up per origin. */
  origins: Source[];
  /** Tools the agent could call, deferred ones included. */
  tools: string[];
  /** Skills the agent was told about. */
  skillsListed: string[];
  steps: Step[];
  uses: SkillUse[];
  /** The subagents it started, oldest first. */
  agents: SessionSummary[];
  /** For a subagent: the title of the session that started it. */
  parentTitle: string | undefined;
};

// Long texts are cut: the page is for reading, the file keeps everything.
const CONTEXT_MAX = 200_000;
const STEP_MAX = 6_000;

function cut(text: string, max: number) {
  return text.length > max
    ? `${text.slice(0, max)}\n… (${text.length - max} more characters)`
    : text;
}

function part(
  kind: ContextPart["kind"],
  label: string,
  text: string,
  from: Attribution,
  file?: string,
): ContextPart {
  const chars = text.length;
  return {
    kind,
    label,
    file,
    text: cut(text, CONTEXT_MAX),
    chars,
    sources: [{ ...from, count: 1, chars }],
  };
}

/** One entry of a list part: a skill, a tool, an MCP server's instructions. */
type Item = Attribution & { text: string; chars?: number };

/** A list part, its text grouped by origin. */
function listPart(kind: ContextPart["kind"], label: string, items: Item[]): ContextPart {
  const groups = new Map<string, { from: Attribution; items: Item[] }>();
  for (const item of items) {
    const key = `${item.origin}\u0000${item.name ?? ""}`;
    const group = groups.get(key) ?? { from: { origin: item.origin, name: item.name }, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  const sources = [...groups.values()]
    .map(({ from, items: list }) => ({
      ...from,
      count: list.length,
      chars: list.reduce((sum, item) => sum + (item.chars ?? item.text.length), 0),
    }))
    .sort((a, b) => b.chars - a.chars);
  const text = sources
    .map((source) => {
      const list = groups.get(`${source.origin}\u0000${source.name ?? ""}`)!.items;
      const title = [originTitle[source.origin], source.name].filter(Boolean).join(" · ");
      return `## ${title} (${list.length})\n\n${list.map((item) => item.text).join("\n")}`;
    })
    .join("\n\n");
  const chars = sources.reduce((sum, source) => sum + source.chars, 0);
  return { kind, label, text: cut(text, CONTEXT_MAX), chars, sources };
}

/** Text of a message content: a string, or an array of text blocks. */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content === undefined ? "" : JSON.stringify(content);
  return content
    .map((block) => {
      if (typeof block === "string") return block;
      if (block && typeof block === "object" && "text" in block && typeof block.text === "string") {
        return block.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function asJson(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function rows(text: string): Record<string, any>[] {
  const out: Record<string, any>[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row && typeof row === "object") out.push(row);
    } catch {
      // A line cut by a session still being written.
    }
  }
  return out;
}

// A command that reads a SKILL.md, not one that lists files; group 1 is the path.
const READ_SKILL =
  /\b(?:cat|sed|head|tail|nl|bat|less|more|awk)\b[^\n|;&]*?((?:[~\w./-]*\/)?[A-Za-z0-9][\w.-]*\/SKILL\.md)/g;
const COMMAND = /<command-name>\/([A-Za-z0-9:_-]+)<\/command-name>/;
const DOLLAR = /(?:^|\s)\$([A-Za-z0-9][A-Za-z0-9_-]*)/g;

/**
 * The skills a command loads, without repeats: it reads the SKILL.md of a
 * skill the session listed, at the path the list gave (`listed`: path → name).
 * Reading another copy, or a skill not listed, is looking at it (a review, a
 * search), not using it.
 */
export function skillsRead(text: string, listed: Map<string, string>, cwd?: string) {
  const names: string[] = [];
  for (const match of text.matchAll(READ_SKILL)) {
    let path = match[1]!.replace(/^~(?=\/)/, homedir());
    if (!isAbsolute(path) && !/^r\d+\//.test(path) && cwd) path = resolve(cwd, path);
    const name = listed.get(path);
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

type Parsed = Omit<
  SessionDetail,
  "file" | "space" | "updatedAt" | "subagents" | "agents" | "parentTitle"
>;

function finish(parsed: Parsed): Parsed {
  parsed.skills = [...new Set(parsed.uses.map((use) => use.skill))];
  parsed.prompts = parsed.steps.filter((step) => step.kind === "prompt").length;
  parsed.toolCalls = parsed.steps.filter((step) => step.kind === "tool").length;
  parsed.endedAt = [...parsed.steps].reverse().find((step) => step.at)?.at;
  parsed.contextChars = parsed.context.reduce((sum, item) => sum + item.chars, 0);
  parsed.origins = totalSources(parsed.context.map((item) => item.sources));
  parsed.tools = [...new Set(parsed.tools)];
  parsed.skillsListed = [...new Set(parsed.skillsListed)];
  return parsed;
}

function empty(id: string, harness: Harness): Parsed {
  return {
    id,
    harness,
    title: "",
    cwd: undefined,
    model: undefined,
    client: undefined,
    startedAt: undefined,
    endedAt: undefined,
    parent: undefined,
    agentType: undefined,
    prompts: 0,
    toolCalls: 0,
    skills: [],
    contextChars: 0,
    context: [],
    origins: [],
    tools: [],
    skillsListed: [],
    steps: [],
    uses: [],
  };
}

/**
 * Claude Code's system prompt, and what the client that started it appended
 * (T3 Code's sections name it), as separate parts.
 */
function systemParts(sections: string[]): ContextPart[] {
  const groups: { from: Attribution; texts: string[] }[] = [];
  for (const section of sections) {
    if (section.startsWith("__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__")) continue;
    const from: Attribution = /\bT3 Code\b/.test(section)
      ? { origin: "t3-code" }
      : { origin: "claude-code" };
    const last = groups.at(-1);
    if (last?.from.origin === from.origin) last.texts.push(section);
    else groups.push({ from, texts: [section] });
  }
  return groups.map((group) =>
    part(
      "system",
      group.from.origin === "claude-code" ? "System prompt" : "Added to the system prompt",
      group.texts.join("\n\n"),
      group.from,
    ),
  );
}

/**
 * A Claude Code session file: claude/projects/<folder>/<session>.jsonl. A
 * subagent's file is all sidechain: `sidechain` reads it instead of skipping it.
 */
export function parseClaude(id: string, text: string, env: Env, sidechain = false): Parsed {
  const session = empty(id, "claude");
  const tools = new Map<string, Extract<Step, { kind: "tool" }>>();
  let system: ContextPart[] = [];
  const mcp = new Map<string, string>();
  let inline: Item[] = [];
  const deferred: string[] = [];
  // Hook commands by event, to tell whose hook gave which context.
  const hooks = new Map<string, string>();
  const hookParts: { part: ContextPart; event: string }[] = [];
  let aiTitle = "";
  let firstPrompt = "";
  const seen = new Set<string>();
  const once = (key: string) => (seen.has(key) ? false : (seen.add(key), true));

  for (const row of rows(text)) {
    const at: string | undefined = row.timestamp;
    if (row.isSidechain && !sidechain) continue;
    if (row.cwd && !session.cwd) session.cwd = row.cwd;
    if (at && !session.startedAt) session.startedAt = at;
    if (row.entrypoint && !session.client) session.client = row.entrypoint;

    if (row.type === "ai-title" && typeof row.aiTitle === "string") aiTitle = row.aiTitle;

    if (row.type === "attachment" && row.attachment) {
      const a = row.attachment;
      switch (a.type) {
        case "prompt_snapshot": {
          const sections: string[] = (
            Array.isArray(a.systemPrompt) ? a.systemPrompt : [textOf(a.systemPrompt)]
          ).filter((section: unknown) => typeof section === "string" && section.trim());
          if (sections.length > 0) system = systemParts(sections);
          if (Array.isArray(a.tools) && a.tools.length > 0) {
            inline = a.tools
              .filter((tool: { name?: unknown }) => typeof tool?.name === "string")
              .map((tool: { name: string }) => ({
                ...toolOrigin(tool.name, "claude-code"),
                text: tool.name,
                chars: JSON.stringify(tool).length,
              }));
          }
          break;
        }
        case "instructions":
          for (const file of a.files ?? []) {
            if (once(`instructions:${file.path}`)) {
              session.context.push(
                part(
                  "instructions",
                  homePath(file.path),
                  textOf(file.content),
                  fileOrigin(file.path, row.cwd, env),
                  file.path,
                ),
              );
            }
          }
          break;
        case "hook_additional_context": {
          const body = textOf(a.content);
          if (a.hookEvent === "SessionStart" && once(`hook:${body}`)) {
            const hook = part("hook", `Hook ${a.hookEvent}`, body, { origin: "other" });
            hookParts.push({ part: hook, event: a.hookEvent });
            session.context.push(hook);
          } else if (a.hookEvent !== "SessionStart") {
            session.steps.push({
              kind: "context",
              at,
              label: `Hook ${a.hookEvent}`,
              text: cut(body, STEP_MAX),
            });
          }
          break;
        }
        case "hook_success":
          if (a.hookEvent && typeof a.command === "string") hooks.set(a.hookEvent, a.command);
          break;
        case "skill_listing":
          session.skillsListed.push(...(a.names ?? []));
          if (a.isInitial !== false && once("skills")) {
            // One entry per skill: "- name: description".
            const items = textOf(a.content)
              .split(/\n(?=- )/)
              .filter((entry) => entry.trim())
              .map((entry) => {
                const name = /^- ([^:\s]+(?::[^:\s]+)?):/.exec(entry)?.[1] ?? "";
                return { ...claudeSkillOrigin(name, env), text: entry };
              });
            session.context.push(
              listPart("skills", `Skills (${a.skillCount ?? a.names?.length ?? 0})`, items),
            );
          }
          break;
        case "deferred_tools_delta":
          deferred.push(...(a.addedNames ?? []));
          break;
        case "mcp_instructions_delta":
          // Servers connect and reconnect: keep each one's latest instructions.
          (a.addedNames ?? []).forEach((name: string, index: number) => {
            const block = a.addedBlocks?.[index];
            if (typeof block === "string") mcp.set(name, block);
          });
          break;
        case "session_context":
        case "environment":
          if (once(a.type))
            session.context.push(
              part(
                "other",
                a.type === "environment" ? "Environment" : "Session context",
                asJson(a.context ?? a.snapshot),
                { origin: "claude-code" },
              ),
            );
          break;
      }
      continue;
    }

    const message = row.message;
    if (!message) continue;

    if (row.type === "assistant") {
      if (message.model && message.model !== "<synthetic>") session.model = message.model;
      for (const block of Array.isArray(message.content) ? message.content : []) {
        if (block.type === "text" && block.text?.trim()) {
          session.steps.push({ kind: "reply", at, text: cut(block.text, STEP_MAX) });
        } else if (block.type === "tool_use") {
          const step = {
            kind: "tool" as const,
            at,
            id: block.id,
            name: block.name,
            input: cut(asJson(block.input), STEP_MAX),
          };
          tools.set(block.id, step);
          session.steps.push(step);
          if (block.name === "Skill" && typeof block.input?.skill === "string") {
            session.uses.push({
              id: block.id,
              ts: at ?? "",
              skill: block.input.skill,
              agent: "claude-code",
              trigger: "model",
              session: id,
              cwd: row.cwd,
            });
          }
        }
      }
    } else if (row.type === "user") {
      const content = message.content;
      if (Array.isArray(content) && content.some((block) => block?.type === "tool_result")) {
        for (const block of content) {
          const step = block?.type === "tool_result" ? tools.get(block.tool_use_id) : undefined;
          if (step) {
            step.output = cut(textOf(block.content), STEP_MAX);
            step.error = block.is_error === true;
          }
        }
        continue;
      }
      const body = textOf(content);
      if (!body.trim()) continue;
      if (row.isMeta) {
        session.steps.push({ kind: "context", at, label: "Injected", text: cut(body, STEP_MAX) });
        continue;
      }
      session.steps.push({ kind: "prompt", at, text: cut(body, STEP_MAX) });
      if (!firstPrompt) firstPrompt = body;
      const command = COMMAND.exec(body)?.[1];
      if (command && row.uuid) {
        session.uses.push({
          id: row.uuid,
          ts: at ?? "",
          skill: command,
          agent: "claude-code",
          trigger: "user",
          session: id,
          cwd: row.cwd,
        });
      }
    }
  }

  session.context.unshift(...system);
  for (const { part: hook, event } of hookParts) {
    const from = commandOrigin(hooks.get(event), env);
    hook.sources = hook.sources.map((source) => ({ ...source, ...from }));
  }
  if (mcp.size > 0) {
    const items = [...mcp].map(([server, block]) => ({ ...mcpOrigin(server), text: block }));
    session.context.push(listPart("mcp", `MCP instructions (${mcp.size})`, items));
  }
  // Deferred tools are given by name only, until the agent loads one.
  const known = new Set(inline.map((item) => item.text));
  const toolItems = [
    ...inline,
    ...[...new Set(deferred)]
      .filter((name) => !known.has(name))
      .map((name) => ({ ...toolOrigin(name, "claude-code"), text: name })),
  ];
  session.tools = toolItems.map((item) => item.text);
  if (toolItems.length > 0) {
    session.context.push(listPart("tools", `Tools (${toolItems.length})`, toolItems));
  }
  // A /command is a skill only when the session listed one by that name.
  const listed = new Set(session.skillsListed);
  session.uses = session.uses.filter((use) => use.trigger === "model" || listed.has(use.skill));
  session.title = aiTitle || firstLine(firstPrompt) || id;
  return finish(session);
}

/**
 * Codex's additional_tools, one item per tool, namespaced ones as
 * namespace.name. Its own namespaces (functions, clock...) are Codex's; an
 * mcp__<server> namespace is that server's.
 */
function codexTools(list: unknown, namespace?: string): Item[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((tool): Item[] => {
    if (!tool || typeof tool !== "object") return [];
    const name = typeof tool.name === "string" ? tool.name : "";
    if (Array.isArray(tool.tools)) return codexTools(tool.tools, name);
    if (!name) return [];
    const server = namespace?.startsWith("mcp__") ? namespace.slice(5) : undefined;
    const from: Attribution = server ? mcpOrigin(server) : { origin: "codex" };
    const full = namespace && namespace !== "functions" ? `${namespace}.${name}` : name;
    return [{ ...from, text: full, chars: JSON.stringify(tool).length }];
  });
}

/** A developer message's label and origin, from the tag it starts with. */
function codexMessage(text: string) {
  const tag = /^<([a-z][a-z0-9_]*?)(?:_\d+)?>/.exec(text)?.[1];
  if (tag === "skills_instructions") {
    return { kind: "skills" as const, label: "Skills", from: { origin: "codex" as const } };
  }
  if (tag) {
    const from: Attribution = tag.startsWith("t3_code")
      ? { origin: "t3-code" }
      : { origin: "codex" };
    return { kind: "message" as const, label: tag.replace(/_/g, " "), from };
  }
  if (text.startsWith("Space of this session:")) {
    // The SessionStart hook of codex/hooks.json.
    return {
      kind: "hook" as const,
      label: "Hook SessionStart",
      from: { origin: "opai" as const },
    };
  }
  return {
    kind: "message" as const,
    label: "Developer message",
    from: { origin: "codex" as const },
  };
}

const CODEX_SKILL = /^- ([A-Za-z0-9][A-Za-z0-9_.:-]*): .*\(file: ([^)]*SKILL\.md)\)\s*$/gm;
const CODEX_ROOT = /^- `(r\d+)` = `([^`]+)`/gm;

/**
 * Codex's skills message, split by where each skill lives: its roots (r0 =
 * /path) tell the folder of each SKILL.md. The text before the list is Codex's.
 */
function codexSkills(body: string, env: Env) {
  const roots = new Map([...body.matchAll(CODEX_ROOT)].map((match) => [match[1]!, match[2]!]));
  const entries = [...body.matchAll(CODEX_SKILL)];
  // Where each listed SKILL.md is, as the list names it (r0/x/SKILL.md) and expanded.
  const files = new Map<string, string>();
  const items: Item[] = entries.map((match) => {
    const file = match[2]!.replace(/^(r\d+)(?=\/)/, (alias) => roots.get(alias) ?? alias);
    files.set(file, match[1]!).set(match[2]!, match[1]!);
    return { ...codexSkillOrigin(file, env), text: match[0] };
  });
  const listed = entries.reduce((sum, match) => sum + match[0].length, 0);
  items.unshift({
    origin: "codex",
    text: "(how to use skills, skill roots)",
    chars: body.length - listed,
  });
  return {
    names: entries.map((match) => match[1]!),
    files,
    part: listPart("skills", `Skills (${entries.length})`, items),
  };
}

/** A Codex session file: codex/sessions/<y>/<m>/<d>/rollout-<time>-<id>.jsonl. */
export function parseCodex(id: string, text: string, env: Env): Parsed {
  const session = empty(id, "codex");
  const tools = new Map<string, Extract<Step, { kind: "tool" }>>();
  let prompted = false;
  let firstPrompt = "";
  let base = "";
  const toolItems: Item[] = [];
  // The SKILL.md files the session listed, path → skill name.
  const skillFiles = new Map<string, string>();
  const seen = new Set<string>();

  for (const row of rows(text)) {
    const at: string | undefined = row.timestamp;
    const p = row.payload ?? {};
    if (at && !session.startedAt) session.startedAt = at;

    if (row.type === "session_meta") {
      session.cwd = p.cwd;
      session.client = p.originator;
      const spawn = p.source?.subagent?.thread_spawn;
      if (spawn && typeof spawn.parent_thread_id === "string") {
        session.parent = spawn.parent_thread_id;
        session.agentType = typeof spawn.agent_role === "string" ? spawn.agent_role : undefined;
        if (typeof spawn.agent_nickname === "string") session.title = spawn.agent_nickname;
      }
      base = textOf(p.base_instructions?.text ?? p.base_instructions);
      if (base) {
        session.context.push(part("system", "Base instructions", base, { origin: "codex" }));
      }
      continue;
    }
    if (row.type === "turn_context") {
      if (p.model) session.model = p.model;
      if (p.cwd) session.cwd = p.cwd;
      continue;
    }
    if (row.type !== "response_item") continue;

    if (p.type === "additional_tools") {
      toolItems.push(...codexTools(p.tools));
    } else if (p.type === "message") {
      const body = textOf(p.content);
      if (!body.trim()) continue;
      if (p.role === "assistant") {
        session.steps.push({ kind: "reply", at, text: cut(body, STEP_MAX) });
      } else if (p.role === "developer") {
        // The first developer message repeats the base instructions.
        if (body === base) continue;
        const { kind, label, from } = codexMessage(body);
        if (prompted) {
          session.steps.push({ kind: "context", at, label, text: cut(body, STEP_MAX) });
        } else if (kind === "skills") {
          const skills = codexSkills(body, env);
          session.skillsListed.push(...skills.names);
          for (const [file, name] of skills.files) skillFiles.set(file, name);
          session.context.push(skills.part);
        } else {
          session.context.push(part(kind, label, body, from));
        }
      } else if (p.role === "user") {
        const instructions = body.startsWith("# AGENTS.md instructions");
        if (instructions || body.startsWith("<environment_context>")) {
          // Codex sends these again on later turns: only a change is news.
          if (seen.has(body)) continue;
          seen.add(body);
          const source = /^# AGENTS\.md instructions for (\S+)/.exec(body)?.[1];
          const label = !instructions
            ? "Environment"
            : source
              ? `AGENTS.md of ${homePath(source)}`
              : "AGENTS.md (global)";
          if (prompted)
            session.steps.push({ kind: "context", at, label, text: cut(body, STEP_MAX) });
          else
            session.context.push(
              part(
                instructions ? "instructions" : "other",
                label,
                body,
                !instructions
                  ? { origin: "codex" }
                  : source
                    ? fileOrigin(join(source, "AGENTS.md"), session.cwd, env)
                    : { origin: "opai" },
                source,
              ),
            );
        } else {
          prompted = true;
          if (!firstPrompt) firstPrompt = body;
          session.steps.push({ kind: "prompt", at, text: cut(body, STEP_MAX) });
          for (const match of body.matchAll(DOLLAR)) {
            session.uses.push({
              id: `${id}:${at}:${match[1]}:user`,
              ts: at ?? "",
              skill: match[1]!,
              agent: "codex",
              trigger: "user",
              session: id,
              cwd: session.cwd,
            });
          }
        }
      }
    } else if (
      p.type === "function_call" ||
      p.type === "custom_tool_call" ||
      p.type === "local_shell_call"
    ) {
      const call = p.call_id ?? p.id ?? `${id}:${at}`;
      const input = asJson(p.arguments ?? p.input ?? p.action);
      const step = {
        kind: "tool" as const,
        at,
        id: call,
        name: p.name ?? p.type,
        input: cut(input, STEP_MAX),
      };
      tools.set(call, step);
      session.steps.push(step);
      for (const skill of skillsRead(input, skillFiles, session.cwd)) {
        session.uses.push({
          id: `${call}:${skill}`,
          ts: at ?? "",
          skill,
          agent: "codex",
          trigger: "model",
          session: id,
          cwd: session.cwd,
        });
      }
    } else if (p.type === "function_call_output" || p.type === "custom_tool_call_output") {
      const step = tools.get(p.call_id);
      if (step)
        step.output = cut(
          textOf(typeof p.output === "string" ? p.output : (p.output?.content ?? p.output)),
          STEP_MAX,
        );
    }
  }

  session.tools = toolItems.map((item) => item.text);
  if (toolItems.length > 0) {
    session.context.push(listPart("tools", `Tools (${toolItems.length})`, toolItems));
  }
  // A $mention is a skill only when the session listed one by that name.
  const listed = new Set(session.skillsListed);
  session.uses = session.uses.filter((use) => use.trigger === "model" || listed.has(use.skill));
  session.title = session.title || firstLine(firstPrompt) || id;
  return finish(session);
}

/** The first line of a prompt, without the blocks a client wraps around it. */
function firstLine(text: string) {
  const first = (value: string) =>
    value
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean);
  const line =
    first(text.replace(/<([a-z_-]+)[^>]*>[\s\S]*?<\/\1>/g, " ")) ??
    first(text.replace(/<[^>]+>/g, " "));
  return line ? cut(line, 120).split("\n")[0]! : "";
}

// --- Files -----------------------------------------------------------------

type SessionFile = {
  id: string;
  harness: Harness;
  path: string;
  mtime: number;
  size: number;
  /** A Claude subagent: what its .meta.json says. */
  agent?: AgentMeta | undefined;
};

type AgentMeta = { parent: string; description?: string; type?: string; toolUseId?: string };

async function walk(folder: string, keep: (name: string) => boolean): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch {
    return [];
  }
  const found = await Promise.all(
    entries.map(async (entry) => {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) return walk(path, keep);
      return entry.isFile() && keep(entry.name) ? [path] : [];
    }),
  );
  return found.flat();
}

const CODEX_FILE =
  /^rollout-.*?-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/;

/** Every session file of the instance. Claude's subagent files are left out. */
export async function sessionFiles(root: string): Promise<SessionFile[]> {
  const claude = (await walk(join(root, "claude", "projects"), (name) => name.endsWith(".jsonl")))
    .filter((path) => !path.includes("/subagents/"))
    .map((path) => ({ id: basename(path, ".jsonl"), harness: "claude" as const, path }));
  const codex = (
    await Promise.all(
      ["sessions", "archived_sessions"].map((folder) =>
        walk(join(root, "codex", folder), (name) => CODEX_FILE.test(name)),
      ),
    )
  )
    .flat()
    .map((path) => ({ id: CODEX_FILE.exec(basename(path))![1]!, harness: "codex" as const, path }));
  const files = await Promise.all(
    [...claude, ...codex].map(async (file) => {
      const info = await stat(file.path);
      return { ...file, mtime: info.mtimeMs, size: info.size };
    }),
  );
  // Newest first, then by id: the order a page's cursor counts on.
  return files.sort((a, b) => b.mtime - a.mtime || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The folder of a Claude session's subagents. */
const agentsFolder = (file: SessionFile) => join(dirname(file.path), file.id, "subagents");

const AGENT_FILE = /^agent-([A-Za-z0-9-]{8,80})\.jsonl$/;

async function readMeta(path: string, parent: string): Promise<AgentMeta> {
  try {
    // Claude Code can write the object twice in a row: read the last one.
    const objects = (await readFile(path, "utf8")).trim().split(/(?<=\})\s*(?=\{)/);
    const meta = JSON.parse(objects.at(-1) ?? "{}") as Record<string, unknown>;
    const text = (key: string) => (typeof meta[key] === "string" ? meta[key] : undefined);
    return {
      parent,
      ...(text("description") ? { description: text("description") } : {}),
      ...(text("agentType") ? { type: text("agentType") } : {}),
      ...(text("toolUseId") ? { toolUseId: text("toolUseId") } : {}),
    };
  } catch {
    return { parent };
  }
}

/** The subagent files of a Claude session; none for Codex, whose subagents are sessions. */
async function agentFiles(file: SessionFile): Promise<SessionFile[]> {
  if (file.harness !== "claude") return [];
  const folder = agentsFolder(file);
  let names: string[];
  try {
    names = await readdir(folder);
  } catch {
    return [];
  }
  return Promise.all(
    names.flatMap((name) => {
      const id = AGENT_FILE.exec(name)?.[1];
      if (!id) return [];
      const path = join(folder, name);
      return [
        (async () => {
          const info = await stat(path);
          return {
            id,
            harness: "claude" as const,
            path,
            mtime: info.mtimeMs,
            size: info.size,
            agent: await readMeta(join(folder, `agent-${id}.meta.json`), file.id),
          };
        })(),
      ];
    }),
  );
}

// Parsed sessions, kept while their file does not change.
const cache = new Map<string, { mtime: number; size: number; session: SessionDetail }>();

export async function readSession(root: string, file: SessionFile): Promise<SessionDetail> {
  const hit = cache.get(file.path);
  if (hit && hit.mtime === file.mtime && hit.size === file.size) return hit.session;
  const text = await readFile(file.path, "utf8");
  const env = machineEnv(root);
  const parsed =
    file.harness === "claude"
      ? parseClaude(file.id, text, env, file.agent !== undefined)
      : parseCodex(file.id, text, env);
  if (file.agent) {
    parsed.parent = file.agent.parent;
    parsed.agentType = file.agent.type;
    if (file.agent.description) parsed.title = file.agent.description;
  }
  const session: SessionDetail = {
    ...parsed,
    file: relative(root, file.path),
    space: parsed.cwd ? which(root, parsed.cwd)?.space.name : undefined,
    updatedAt: new Date(file.mtime).toISOString(),
    subagents: 0,
    agents: [],
    parentTitle: undefined,
  };
  cache.set(file.path, { mtime: file.mtime, size: file.size, session });
  return session;
}

function summary(session: SessionDetail): SessionSummary {
  const {
    context: _context,
    origins: _origins,
    tools: _tools,
    skillsListed: _listed,
    steps: _steps,
    uses: _uses,
    agents: _agents,
    parentTitle: _parentTitle,
    ...rest
  } = session;
  return rest;
}

/** The first line of a file: a Codex session's session_meta. */
async function headLine(path: string) {
  const handle = await open(path, "r");
  try {
    const chunks: Buffer[] = [];
    let position = 0;
    // session_meta holds the base instructions: tens of kilobytes.
    while (position < 4_000_000) {
      const { buffer, bytesRead } = await handle.read(Buffer.alloc(65_536), 0, 65_536, position);
      if (bytesRead === 0) break;
      const chunk = buffer.subarray(0, bytesRead);
      const end = chunk.indexOf(10);
      chunks.push(end === -1 ? chunk : chunk.subarray(0, end));
      if (end !== -1) break;
      position += bytesRead;
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    await handle.close();
  }
}

// The parent each Codex session names, kept while its file does not change.
const parents = new Map<string, { mtime: number; parent: string | undefined }>();

/**
 * The session a Codex session was started by, if it is a subagent: its first
 * line says it. Reading only that line keeps a list of thousands quick.
 */
async function codexParent(file: SessionFile) {
  const hit = parents.get(file.path);
  if (hit?.mtime === file.mtime) return hit.parent;
  let parent: string | undefined;
  try {
    const spawn = JSON.parse(await headLine(file.path))?.payload?.source?.subagent?.thread_spawn;
    parent = typeof spawn?.parent_thread_id === "string" ? spawn.parent_thread_id : undefined;
  } catch {
    parent = undefined;
  }
  parents.set(file.path, { mtime: file.mtime, parent });
  return parent;
}

/** Each Codex subagent file with the session that started it. */
async function codexChildren(files: SessionFile[]) {
  const codex = files.filter((file) => file.harness === "codex");
  const found = await Promise.all(
    codex.map(async (file) => ({ file, parent: await codexParent(file) })),
  );
  return found.filter((item): item is { file: SessionFile; parent: string } => !!item.parent);
}

/** Where a page of sessions stops: the last file it read, by date then id. */
const cursorOf = (file: SessionFile) => `${file.mtime}|${file.id}`;

function after(files: SessionFile[], cursor: string | undefined) {
  if (!cursor) return 0;
  const [mtime = "", id = ""] = cursor.split("|");
  const index = files.findIndex(
    (file) => file.mtime < Number(mtime) || (file.mtime === Number(mtime) && file.id > id),
  );
  return index === -1 ? files.length : index;
}

export type SessionPage = {
  sessions: SessionSummary[];
  /** Pass it back for the next page; undefined after the last one. */
  next: string | undefined;
};

/**
 * A page of sessions, the newest first, from `cursor` on. Only the files of
 * the page are read: an instance can hold thousands of sessions. Empty
 * sessions (opened, then closed) and Codex subagents of a session here are
 * left out, so a page reads files until it has `limit` sessions.
 */
export const listSessions = (root: string, cursor?: string, limit = 25) =>
  Effect.tryPromise({
    try: async (): Promise<SessionPage> => {
      const files = await sessionFiles(root);
      const ids = new Set(files.map((file) => file.id));
      const nested = (session: SessionDetail) =>
        session.parent !== undefined && ids.has(session.parent);
      const codexAgents = new Map<string, number>();
      for (const { parent } of await codexChildren(files)) {
        if (ids.has(parent)) codexAgents.set(parent, (codexAgents.get(parent) ?? 0) + 1);
      }
      const sessions: SessionSummary[] = [];
      let index = after(files, cursor);
      let last: SessionFile | undefined;
      while (index < files.length && sessions.length < limit) {
        const batch = files.slice(index, index + limit);
        const read = await Promise.all(
          batch.map(async (file) => ({
            file,
            session: await readSession(root, file),
            agents: (await agentFiles(file)).length,
          })),
        );
        for (const { file, session, agents } of read) {
          index += 1;
          last = file;
          if (session.prompts === 0 || nested(session)) continue;
          sessions.push({
            ...summary(session),
            subagents: agents + (codexAgents.get(session.id) ?? 0),
          });
          if (sessions.length === limit) break;
        }
      }
      return { sessions, next: index < files.length && last ? cursorOf(last) : undefined };
    },
    catch: (cause) => new SessionsUnreadable({ path: root, cause }),
  });

/** A session with its subagents, its Agent calls linked to the subagent each one started. */
async function withAgents(root: string, file: SessionFile, files: SessionFile[]) {
  const session = await readSession(root, file);
  const agentList = await agentFiles(file);
  const claude = await Promise.all(agentList.map((agent) => readSession(root, agent)));
  const codex = await Promise.all(
    (await codexChildren(files))
      .filter((child) => child.parent === session.id)
      .map((child) => readSession(root, child.file)),
  );
  const agents = [...claude, ...codex].sort((a, b) =>
    (a.startedAt ?? a.updatedAt).localeCompare(b.startedAt ?? b.updatedAt),
  );
  const started = new Map(
    agentList.flatMap((agent) =>
      agent.agent?.toolUseId ? [[agent.agent.toolUseId, agent.id]] : [],
    ),
  );
  const parent = files.find((other) => other.id === session.parent);
  const detail: SessionDetail = {
    ...session,
    steps: session.steps.map((step) =>
      step.kind === "tool" && started.has(step.id)
        ? { ...step, agent: started.get(step.id) }
        : step,
    ),
    agents: agents.map(summary),
    subagents: agents.length,
    parentTitle: parent ? (await readSession(root, parent)).title : undefined,
  };
  return detail;
}

const unreadable = (path: string) => (cause: unknown) => new SessionsUnreadable({ path, cause });

const listFiles = (root: string) =>
  Effect.tryPromise({ try: () => sessionFiles(root), catch: unreadable(root) });

export const getSession = (root: string, id: string) =>
  Effect.gen(function* () {
    const files = yield* listFiles(root);
    const file = files.find((item) => item.id === id);
    if (!file) return yield* Effect.fail(new SessionNotFound({ id }));
    return yield* Effect.tryPromise({
      try: () => withAgents(root, file, files),
      catch: unreadable(file.path),
    });
  });

/** One subagent of a session: a Claude subagent file, or a Codex session it started. */
export const getSubagent = (root: string, id: string, agent: string) =>
  Effect.gen(function* () {
    const files = yield* listFiles(root);
    const parent = files.find((item) => item.id === id);
    if (!parent) return yield* Effect.fail(new SessionNotFound({ id }));
    const found = yield* Effect.tryPromise({
      try: async () => {
        const claude = (await agentFiles(parent)).find((item) => item.id === agent);
        if (claude) return claude;
        const codex = files.find((item) => item.id === agent && item.harness === "codex");
        return codex && (await readSession(root, codex)).parent === parent.id ? codex : undefined;
      },
      catch: unreadable(parent.path),
    });
    if (!found) return yield* Effect.fail(new SessionNotFound({ id: `${id}/${agent}` }));
    const session = yield* Effect.tryPromise({
      try: () => withAgents(root, found, files),
      catch: unreadable(found.path),
    });
    // A Claude subagent is not a session of its own: its parent gives the title.
    return {
      ...session,
      parentTitle: (yield* Effect.promise(() => readSession(root, parent))).title,
    };
  });
