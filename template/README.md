# My Opai instance

The rules, notes, records and tool configs my agents read. The engine that
reads them is [Opai](https://github.com/teo-goulois/opai).

```text
spaces/<name>/
├── space.yaml     the folders it claims, the modules it turns off (base, default)
├── AGENTS.md      its rules, if it has any
├── skills/        its skills
├── mcp.json       its MCP servers
├── context/       my notes: agents write only once I said yes
└── agents/        what agents write (journal, issues, skill uses)
handbook/          optional: a handbook, see the engine's README
claude/            Claude Code's config folder (CLAUDE_CONFIG_DIR)
codex/             Codex's config folder (CODEX_HOME)
```

- `global` is the base: its `AGENTS.md` holds the rules for every project,
  and `claude/CLAUDE.md` and `codex/AGENTS.md` link to it.
- `personal` is the default, for any folder no other space claims. Add a
  space with `opai spaces new <name> --path <folder>`, or New space in the app
  (`opai app`); `opai spaces help` lists the rest.

`opai claude` and `opai codex` run the tools on this folder, with the skills
and MCP servers of the session's space (`opai skills help`, `opai mcp help`).
`opai setup` points the hooks and the MCP server to the engine again, after
the engine or this folder moved.
