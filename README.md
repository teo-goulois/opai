# Opai

The operator for your AI work. Opai runs Claude Code and Codex on one folder
you own, your instance: your rules, notes, skills and the records agents
keep. It tells each session which part of your life it works in, gives agents
an MCP server to read your notes and record what they did, and shows all of
it in a local interface.

The engine (this repository) holds no personal data. Your instance is a
separate folder, `~/.opai` by default, that you keep in your own Git
repository.

## Install

Node 24 or later, pnpm, Git, and Claude Code or Codex.

```sh
git clone https://github.com/teo-goulois/opai.git ~/.local/share/opai
cd ~/.local/share/opai && pnpm install
ln -s ~/.local/share/opai/opai ~/.local/bin/opai
opai init
```

Or in one line, with the same steps:

```sh
curl -fsSL https://raw.githubusercontent.com/teo-goulois/opai/main/scripts/install.sh | sh
```

`opai init` creates the instance from `template/`, points its hooks and its
MCP server to the engine, links the skills, and starts a Git repository whose
commits are scanned for secrets (gitleaks). Run it again, or `opai setup`,
after moving the engine or the instance: it only rewrites what Opai owns.

## Commands

```sh
opai init [folder]        # create an instance (default ~/.opai) and set it up
opai setup                # point the instance's hooks and MCP to this engine again
opai claude [arguments]   # Claude Code with CLAUDE_CONFIG_DIR=<instance>/claude
opai codex [arguments]    # Codex with CODEX_HOME=<instance>/codex
opai spaces [command]     # create, change and archive spaces (below)
opai skills [command]     # manage the skills (below)
opai mcp [command]        # manage the MCP servers (below)
opai which [folder]       # the space of a folder
opai sync [--install]     # sync the instance with its Git remote
opai app                  # the local interface
opai home                 # the instance folder
```

`OPAI_HOME` points to another instance. For an app that takes a binary path,
such as T3 Code, `bin/opai-claude` and `bin/opai-codex` run `opai claude|codex`.
Plain `claude` and `codex` keep using `~/.claude` and `~/.codex`. The
transcripts are shared: the instance's `claude/projects`, `codex/sessions` and
`codex/archived_sessions` link to those of `~/.claude` and `~/.codex`, so usage
tools and `/resume` see every session.

Two things reach a session from outside its config folder, and Opai blocks
both: Claude reads `~/.claude/CLAUDE.md` as the instructions of a parent
folder of every project under `~` (`claude/settings.json` excludes it), and
Codex reads `~/.agents/skills` (`opai codex` turns each of those skills off).

## The instance

```text
<instance>/
├── spaces/<name>/
│   ├── space.yaml     the folders it claims, the modules it turns off (base, default)
│   ├── AGENTS.md      its rules, if it has any
│   ├── skills/        its skills
│   ├── mcp.json       its MCP servers
│   ├── context/       your notes: agents write only with your yes
│   └── agents/        what agents write (journal, issues, skill uses)
├── handbook/          optional: your handbook, published to a site
├── claude/            Claude Code's config folder
├── codex/             Codex's config folder
├── analytics.json     optional: the sites the Analytics page compares
└── machines.json      optional: other machines the Automations page reads (SSH)
```

A space groups the rules and notes of one part of your life: a company, a
client, personal projects.

- `global` is the base. Its `AGENTS.md` holds the rules for every project:
  `claude/CLAUDE.md` and `codex/AGENTS.md` link to it. Its `modules/` are the
  optional rules it points to.
- The space with `default: true` takes any folder no other space claims.
- A folder belongs to the space with the longest path containing it. In a Git
  worktree, the same folder of the main repository counts too.

Create and change spaces with `opai spaces` or on the app's Spaces page (New
space, and each space's Settings tab). Both say what a folder change moves
before it happens, refuse a folder another space already claims, and rewrite
only their own lines of `space.yaml`. A change applies from the next session.

```sh
opai spaces list
opai spaces new client-x --description "Client X" --path ~/code/client-x
opai spaces edit client-x --add-path ~/code/x-api --remove-path ~/code/old
opai spaces edit client-x --default        # the default space, in place of the current one
opai spaces archive client-x               # to .local/archive/spaces/; move it back to restore it
```

The base space claims no folder, and neither the base nor the default space
can be archived.

`packages/context/src/hook.ts` runs at the start of each session (hook in
`claude/settings.json` and `codex/hooks.json`). It tells the agent its space
and gives it that space's `AGENTS.md`. Codex runs the hook only after you
trust it with `/hooks`, again after each change of its command.

## MCP server

`packages/context` is also an MCP server, `opai`, that Claude Code and Codex
start per session, in the session's folder:

| Tool | What it does |
| --- | --- |
| `space_current` | The space of the session's folder, or of a folder given, with its rules |
| `memory_search` | Searches the facts in `context/memory/` of that space and of `global` |
| `memory_get` | Reads one fact; refuses any file outside a `context/memory/` folder |
| `journal_append` | Records a finished task in `agents/journal/<day>/` |
| `issue_record` | Records a problem you reported in `agents/issues/`, and counts its occurrences |

Only the procedures listed in `packages/context/src/mcp.ts` become tools. The
two writing tools create a new file per call, never change one, and write in
the space of the session's folder only. They refuse text that looks like a
token or a key. Both run without asking: `opai setup` sets their
`approval_mode` in `codex/config.toml` and allows `mcp__opai` in
`claude/settings.json`.

## Interface

`apps/web` is the local interface (TanStack Start): `opai app`, on
`https://opai.localify` when [Localify](https://github.com/teo-goulois/localify)
is installed, on `127.0.0.1:4748` otherwise. Its pages call the same oRPC procedures as the MCP server, from
`packages/context`; `packages/ui` holds the components and icons, themed by
`GUI.md`. The icons are Lucide, or Nucleo when you own it
(`packages/ui/src/icon/README.md`).

- Spaces, the root of the navigation: each space's overview (the rules and
  skills a session there gets, its own and those of `global`, with what they
  cost), then its rules, skills, memory, journal and issues. A rule or a skill
  opens under its space. A space turns a module of `global` on or off
  (`disable` in its `space.yaml`). New space creates one; a space's Settings
  tab changes its description and folders, makes it the default space, or
  archives it.
- Skills, across spaces: every skill with its space, trigger, observed uses
  and what its description costs in every session. A skill's page sets its
  trigger (automatic, or only on request: `disable-model-invocation`) and the
  description the agent reads to decide, edits its `SKILL.md`, moves it to
  another space, and compares an imported one with its source (`opai
  skills`, below, does the same from a terminal). Import one from either page.
  Each skill also says whether your other machines have it: `opai sync`
  commits only `spaces/*/agents/`, so a skill (its folder and its links in
  `claude/skills/` and `codex/skills/`) stays on this machine until it is
  committed. Its page commits it, and nothing else, with Share; the next sync
  pushes it (`packages/context/src/sharing.ts`).
- MCP: the servers of each space and of its projects (their `.mcp.json`),
  and the secrets they name, stored or missing (a missing one is stored
  from its badge). Add one by pasting what
  its docs give (`claude mcp add ...`, `codex mcp add ...`, JSON, `npx ...`,
  a URL): a preview shows what it becomes and which tokens go to Infisical.
  Move or remove a server (a project's one leaves its `.mcp.json`). Import
  one plain `claude` and `codex` have, or take it out of their configs; the
  copies of a server Opai already has can all go at once. Each server shows
  whether Claude Code reaches it (connected, not signed in, failed with its
  error), and filters keep those left to sign in, missing a secret, failing,
  or ready. A remote one signs in from its Sign in button, for every tool
  and machine; one signed in by Claude Code for itself offers to sign in
  everywhere.
- Config: what Claude Code and Codex read in `claude/` and `codex/`, and the
  instance's own `AGENTS.md` and `CLAUDE.md`, editable.
- Sessions: each session Claude Code and Codex ran on the instance, with the
  program that ran it (T3 Code, the Codex app, `codex exec`...) and its model.
  What the agent was given before the first prompt (system prompt, instruction
  files, hook context, skills, MCP instructions, tools), with a rough size of
  each and who put it there (`packages/context/src/origins.ts`), then what it
  did, and the skills it used. The subagents a session started are shown in
  it, each with its own context and timeline: Claude Code's from
  `<session>/subagents/`, Codex's from the sessions that name it as parent.
- Automations: what runs on each machine, the Codex app's automations and
  your launchd agents, with their schedule in words. The machines of
  `machines.json` (`{ "machines": [{ "name": "runner", "ssh": "<ssh host>" }] }`)
  are read through SSH, read-only. The registry you keep in a space's
  `context/ops.md` is read as entries: a heading whose text holds
  `- **Label:** value` lines. An automation belongs to the entry that names
  its id or label in its `Trigger`, `Manager`, `Automation ID` or `Where`
  line (else anywhere in it, or whose title is its name); one the registry
  does not name at all is flagged, and agents installed by apps are set apart.
  Entries no automation matches (a Grok Bot routine, an agent hook) are listed
  as known only from the registry. An automation's page shows where it runs,
  its prompt, and its entry, which can be edited alone. A Codex automation can
  be paused, resumed, edited (its `automation.toml`) and archived (to
  `.local/archive/codex-automations/`); one of your launchd agents stopped,
  started and restarted, on this machine only.
- Handbook: the instance's handbook, edited in place and published to a site
  (below).
- Analytics: Umami numbers of the sites in `analytics.json`. The keys come
  from the server's environment (`packages/context/src/analytics/README.md`);
  an instance with an `.infisical.yaml` gets them from Infisical.

The Spaces, Rules and Config procedures edit your files, the Sessions ones
read whole conversations, and the Skills ones change skills and fetch from the
network: `mcp.ts` offers none of them to agents.

## Handbook

A handbook is how you build, written down for people and for agents. It
lives in `handbook/` of the instance: one Markdown page per file, with a
`title` and a `description` in its frontmatter (`index.md` is the home page,
`stack/index.md` the page `stack`), and `handbook.json`:

```json
{
  "site": "https://example.com/code",
  "publish": {
    "repo": "https://github.com/you/site.git",
    "path": "content/handbook",
    "build": { "cwd": ".", "script": "handbook:build" }
  },
  "sections": [
    { "title": "Start here", "entries": [{ "page": "" }, { "page": "stack", "depth": 1 }] }
  ],
  "skills": { "groups": [{ "title": "Writing", "skills": ["unslop"] }] }
}
```

- `sections` is the table of contents. An entry is a page, or a link
  (`title`, `href`, `description`). Pages it leaves out come last.
- A page can hold blocks filled from the instance on every read and publish:
  `<!-- opai:skills -->…<!-- /opai:skills -->` lists your skills, grouped as
  `skills.groups` says, and `<!-- opai:include spaces/global/AGENTS.md -->…<!-- /opai:include -->`
  shows a file of the instance.
- Publishing copies `handbook/` into `publish.path` of `publish.repo`, on top
  of `main` in a clone of the app's own (`.local/handbook/`), runs the
  `publish.build` script, and opens a pull request. Nothing reaches `main`
  until you merge. `pages` passes per-page settings through to the site.

## Sync

`opai sync` commits what agents wrote in `spaces/*/agents/`, and only that,
then rebases on the instance's remote and pushes. You commit everything else
yourself; the next run pushes it. `opai sync --install` runs it every 10
minutes with launchd (macOS); log in `~/Library/Logs/opai/sync.log`. A
conflict or a secret stops it with a notification.

Several machines can share one instance: clone it at the same place under
your home folder, then run `opai setup` on each. The tracked configs name the
instance from `$HOME` and reach the engine and node only through
`.local/engine` and `.local/node`, two links each machine points to its own.

Sessions stay on the machine, and Claude Code deletes its own after 30 days.
So the sync first copies each skill use it finds in them into
`spaces/<space>/agents/usage/<machine>.jsonl`, one JSON line per use, in the
space of the session's folder. A use is a call of Claude's Skill tool, a Codex
command that reads a `SKILL.md`, or a prompt that starts with `/<skill>`
(Claude) or mentions `$<skill>` (Codex) for a skill the session offered.

## Skills

A skill lives once, in `spaces/<space>/skills/<name>/`. Those of `global` are
in every session; those of another space only in the sessions of that space,
the space of the folder `opai` starts the tool in.

- Claude Code reads the global skills through `claude/skills/<name>`, and a
  space's skills as a plugin, `.local/plugins/<space>/`, that `opai` loads
  with `--plugin-dir`: Claude names them `<space>:<name>`.
- Codex reads every skill through `codex/skills/<name>`, and `opai` turns
  off, at launch, those of the other spaces. So `opai` owns `skills.config`:
  don't set it in `codex/config.toml`.
- `disable-model-invocation: true` in `SKILL.md` keeps a skill out of the
  agent's list until you ask for it (`/name`, `$name`). `opai skills link`
  writes the same policy into Codex's `agents/openai.yaml`.

```sh
opai skills list                                  # every skill, by space
opai skills add <source> [--space s] [--name n]   # import, with its provenance
opai skills update <name> [--apply]               # diff with its source, then take it
opai skills source <name> <source>                # record where a skill comes from
opai skills new <name> [--space s]                # start one
opai skills move <name> <space>
opai skills remove <name>
opai skills link                                  # after editing skills by hand
opai skills check
```

A source is `owner/repo/path` on GitHub, a GitHub URL, the URL of a
`SKILL.md`, or a folder. An imported skill keeps `.source.json`: the source,
the upstream commit, and digests of the upstream files and of the local copy,
so `update` tells an upstream change from a local one and never drops local
changes without `--force`.

The links only ever touch their own entries: `claude/skills/synced/` (the
claude.ai account) and `codex/skills/.system/` (Codex) stay as they are, and
anything else in the way is reported, not replaced.

## MCP servers

A space declares its MCP servers in `spaces/<space>/mcp.json`, in the shape of
Claude Code's `.mcp.json`. Those of `global` are in every session; those of
another space only in its sessions, where they win over a global server of the
same name. A project keeps the servers dedicated to it in its own `.mcp.json`,
in its repository: they are in the sessions of that project only (the nearest
folder with a `.mcp.json` above where the session starts), and win over the
space's. `opai claude` and `opai codex` load them at launch, so a change
applies from the next session:

- Claude Code gets `--mcp-config=.local/mcp/<space>.json`, written then
  (`<space>-<project>-<hash>.json` in a project). Its own reading of the
  project's `.mcp.json` gives way: a server of the same name keeps Opai's.
- Codex gets one `-c mcp_servers.<name>={...}` per server, a `headersHelper`
  as its `http_headers_helper`. It has no SSE transport: an SSE server
  reaches Claude Code only. A server's `codex` key holds what changes for
  Codex, such as its own `args`; Claude Code never sees it.

The servers of `global` also go into the configs that plain Claude Code and
Codex read, `~/.claude.json` and `~/.codex/config.toml` (in a marked block),
for the apps that start them outside Opai: Claude Desktop, the ChatGPT app.
Each change of `global` and each launch writes them (`opai mcp sync` does it
by hand), replacing a server of the same name; a server that leaves `global`
leaves them. No secret is written: a remote server that needs one gets the
headers helper `opai mcp headers <name>`, which reads it and Opai's sign-in
from Infisical; a local one starts through `opai mcp run <name>`, which puts
its secrets in its environment and finds `npx` on a PATH the apps keep short.

```sh
opai mcp list                                         # every server, by space
opai mcp paste 'claude mcp add --transport http sentry https://mcp.sentry.dev/mcp'
opai mcp paste 'npx -y @stripe/mcp' --space work      # what a provider's docs say to paste
opai mcp add docs https://docs.example/mcp            # or say it yourself, in global
opai mcp add api https://api.example/mcp --header 'Authorization: Bearer ${API_TOKEN}'
opai mcp move <name> <space>
opai mcp remove <name> [--space s]
opai mcp import                                       # the servers the tools keep themselves
opai mcp import <name>... [--space s]                 # copy them into a space
opai mcp forget <name>...                             # take them out of the tools' configs
opai mcp sync                                         # write global's servers into them
opai mcp secrets                                      # the secrets they name: stored or missing
opai mcp secret set <NAME>                            # store one, typed or piped in
opai mcp check
opai mcp status                                       # whether Claude Code reaches each one
opai mcp login <name> [--space s]                     # sign in to a remote one, in the browser
opai mcp logout <name>
opai mcp refresh                                      # renew the tokens about to expire
opai mcp refresh --install                            # on one machine: every 10 minutes, with launchd
```

`status` asks Claude Code itself: a headless `claude -p`, with the
instance's `claude/` and one space's servers as a session gets them, answers
the Agent SDK's `mcp_status` request. No prompt is sent and no session is kept.

`login` signs Opai in, once for Claude Code, Codex and every machine: Opai
registers itself with the server's sign-in service (OAuth with PKCE, the
browser coming back to localhost) and keeps the tokens in Infisical, folder
`/mcp`, as `OAUTH_<NAME>`. At launch, a server signed in this way gets
`opai mcp token <name>` as its `headersHelper` (Claude Code) and
`http_headers_helper` (Codex), which prints its `Authorization` header. A
refresh token often works once, so one machine renews the tokens ahead of
time (`opai mcp refresh --install`, a launchd agent every 10 minutes); the
others renew one only once it has expired, one session at a time. A machine
reads Infisical through its login keychain: a session started over SSH,
where macOS keeps it locked, needs `security unlock-keychain` first. A server whose sign-in service
registers no new client still signs in through each tool (`/mcp` in Claude
Code, `opai codex mcp login <name>`), for that tool on that machine.

`mcp.json` is committed, so it holds no secret: a value can be `${NAME}` or
`${NAME:-default}`, and `add` refuses a literal token. The values live in the
instance's Infisical project (`.infisical.yaml`), folder `/mcp`, in its
default environment. At launch, `opai` reads from there the ones the
session's servers name and the environment lacks, nothing else, and passes
them in the tool's environment, never in its arguments; without Infisical, or
when it fails, the tool starts anyway and those servers lack their token.
Name a secret after its own key (`"API_KEY": "${API_KEY}"`) or put it in
`Authorization: Bearer ${TOKEN}`: Codex then reads it from the environment
too. `paste` and `import` take the tokens out of what they read, store them in
Infisical, and write `${HOME}` for paths in the home folder; `import` reads
`~/.claude.json`, `~/.codex/config.toml` and the instance's `claude/` and
`codex/`.

The `opai` server is not in a space: `opai setup` writes it into the tools'
configs, for plain `claude` and `codex` too. Servers you add with `claude mcp
add` or in `codex/config.toml` keep working; `opai mcp check` reports one
also declared in a space.

## Develop

TypeScript on Node 24+, run without a build. `pnpm install`, then `pnpm check`
runs lint, format, types and tests of the whole workspace. The tests build
throwaway instances and never read yours.
