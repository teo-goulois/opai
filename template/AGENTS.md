# Working in this Opai instance

This folder is an Opai instance: the rules, notes, records and tool configs
that Claude Code and Codex read through `opai claude` and `opai codex`.
README.md describes the layout.

- `spaces/*/context/` holds the owner's notes: read them, never write them.
- Agents write only in `spaces/*/agents/`, through the `opai` MCP tools.
- Never commit what Claude Code or Codex write into `claude/` and `codex/`
  (sessions, caches, logs, credentials): `.gitignore` lists what is tracked.
