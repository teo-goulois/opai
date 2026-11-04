// Where each piece of a session's context comes from: the harness (Claude
// Code, Codex), the client that started the session (T3 Code), my config
// (the instance), the session's project, an account (claude.ai, ChatGPT), or an
// MCP server. The session files don't say it; these rules read it from paths,
// hook commands, MCP server names and skill names.

import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";

import { homePath } from "./spaces.ts";

export type Origin =
  | "claude-code"
  | "codex"
  | "t3-code"
  | "opai"
  | "project"
  | "account"
  | "mcp"
  | "other";

/** One origin of a context part: how many items it gave, and their size. */
export type Source = {
  origin: Origin;
  /** Which account, MCP server, project or other place. */
  name?: string | undefined;
  count: number;
  chars: number;
};

/** What the rules need to know about the machine. */
export type Env = {
  /** The instance folder. */
  root: string;
  home: string;
  /** Skills the instance gives Claude Code and Codex (claude/skills, codex/skills). */
  ownSkills: Set<string>;
  /** Its spaces: Claude names a space's skills <space>:<skill>. */
  spaces: Set<string>;
};

export type Attribution = { origin: Origin; name?: string | undefined };

/** Plain names, for the headings inside a part's text. */
export const originTitle: Record<Origin, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  "t3-code": "T3 Code",
  opai: "Opai",
  project: "Project",
  account: "Account",
  mcp: "MCP",
  other: "Other",
};

function names(folder: string) {
  try {
    return readdirSync(folder).filter((name) => !name.startsWith(".") && name !== "synced");
  } catch {
    return [];
  }
}

export function machineEnv(root: string): Env {
  return {
    root,
    home: homedir(),
    ownSkills: new Set([
      ...names(join(root, "claude", "skills")),
      ...names(join(root, "codex", "skills")),
    ]),
    spaces: new Set(names(join(root, "spaces"))),
  };
}

function inside(path: string, folder: string) {
  return path === folder || path.startsWith(folder.endsWith(sep) ? folder : folder + sep);
}

/** An MCP server, from its name as Claude Code or Codex shows it. */
export function mcpOrigin(server: string): Attribution {
  const key = server.toLowerCase().replace(/[\s_.]+/g, "-");
  if (key === "t3-code" || key.startsWith("t3-code-")) return { origin: "t3-code" };
  if (key === "opai") return { origin: "opai" };
  if (key.startsWith("claude-ai-")) return { origin: "account", name: "claude.ai" };
  if (key === "codex-apps") return { origin: "account", name: "ChatGPT" };
  return { origin: "mcp", name: server };
}

/** A tool: the harness's own, or an MCP server's (mcp__<server>__<tool>). */
export function toolOrigin(tool: string, harness: Origin): Attribution {
  const server = /^mcp__(.+?)__/.exec(tool)?.[1];
  return server ? mcpOrigin(server) : { origin: harness };
}

/** A skill Claude Code lists: mine, a plugin's (plugin:skill), or its own. */
export function claudeSkillOrigin(name: string, env: Env): Attribution {
  const plugin = name.includes(":") ? name.slice(0, name.indexOf(":")) : undefined;
  if (plugin === "anthropic-skills") return { origin: "account", name: "claude.ai" };
  if (plugin && env.spaces.has(plugin)) return { origin: "opai", name: `space ${plugin}` };
  if (plugin) return { origin: "other", name: `plugin ${plugin}` };
  if (env.ownSkills.has(name)) return { origin: "opai" };
  return { origin: "claude-code" };
}

/** A skill Codex lists, from the folder of its SKILL.md. */
export function codexSkillOrigin(path: string, env: Env): Attribution {
  const skills = join(env.root, "codex", "skills");
  if (inside(path, join(skills, ".system"))) return { origin: "codex" };
  if (inside(path, skills)) return { origin: "opai" };
  if (path.includes(`${sep}plugins${sep}cache${sep}`))
    return { origin: "account", name: "ChatGPT" };
  if (inside(path, join(env.home, ".agents"))) return { origin: "other", name: "~/.agents (v1)" };
  return { origin: "other", name: homePath(dirname(path)) };
}

/** An instruction file: the instance's, the project's (a parent of the session's folder), or elsewhere. */
export function fileOrigin(path: string, cwd: string | undefined, env: Env): Attribution {
  if (inside(path, env.root)) return { origin: "opai" };
  const folder = dirname(path);
  if (cwd && inside(cwd, folder) && folder !== env.home) {
    return { origin: "project", name: homePath(folder) };
  }
  return { origin: "other", name: homePath(path) };
}

/** A hook, from its command. */
export function commandOrigin(command: string | undefined, env: Env): Attribution {
  if (!command) return { origin: "other", name: "hook" };
  if (command.includes(env.root)) return { origin: "opai" };
  if (/[/\\]\.t3[/\\]|t3-code/.test(command)) return { origin: "t3-code" };
  return { origin: "other", name: command.length > 60 ? `${command.slice(0, 60)}…` : command };
}

/** Sources added up per origin and name, biggest first. */
export function totalSources(lists: Source[][]): Source[] {
  const totals = new Map<string, Source>();
  for (const source of lists.flat()) {
    const key = `${source.origin}\u0000${source.name ?? ""}`;
    const total = totals.get(key) ?? {
      origin: source.origin,
      name: source.name,
      count: 0,
      chars: 0,
    };
    total.count += source.count;
    total.chars += source.chars;
    totals.set(key, total);
  }
  return [...totals.values()].sort((a, b) => b.chars - a.chars);
}
