# Working in this Opai instance

This folder is an Opai instance: the rules, notes, records and tool configs
that Claude Code and Codex read through `opai claude` and `opai codex`.
README.md describes the layout.

- `spaces/*/context/` holds the owner's notes. An agent changes them only with
  the owner's yes, asked in the task or given in one of their rules (a module
  that keeps a registry current); otherwise it proposes the change.
- Everything else agents write goes in `spaces/*/agents/`, through the `opai`
  MCP tools.
- Add, move or remove an MCP server with `opai mcp`, in the space it serves
  (`global` for every session): `opai mcp paste '<what its docs say>'`. Its
  tokens go to Infisical (`opai mcp secret set`), never into `mcp.json`.
  `opai mcp status` says which servers Claude Code reaches; a remote one
  that is not signed in waits for the user's `opai mcp login <name>`.
  Opai writes global's servers into `~/.claude.json` and
  `~/.codex/config.toml` itself (`opai mcp sync`): change them in the
  space, never in those files.
- Never commit what Claude Code or Codex write into `claude/` and `codex/`
  (sessions, caches, logs, credentials): `.gitignore` lists what is tracked.
