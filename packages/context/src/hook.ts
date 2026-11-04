// The session hook, and a way to ask a folder's space from a shell.
//
//   node hook.ts session    SessionStart hook of Claude Code and Codex: reads the
//                           hook's JSON on stdin, prints the space as extra context
//   node hook.ts which [folder]
//
// The hook never fails the agent: any error gives no context.

import { readFileSync } from "node:fs";

import { ROOT, homePath, sessionContext, which } from "./spaces.ts";

const [command, folder] = process.argv.slice(2);

if (command === "session") {
  try {
    const input: unknown = JSON.parse(readFileSync(0, "utf8"));
    const cwd =
      typeof input === "object" && input !== null && "cwd" in input && typeof input.cwd === "string"
        ? input.cwd
        : process.cwd();
    const text = sessionContext(ROOT, cwd);
    if (text) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text },
        }) + "\n",
      );
    }
  } catch {
    // A hook must never break the agent.
  }
} else if (command === "which") {
  const match = which(ROOT, folder ?? process.cwd());
  console.log(
    match ? `${match.space.name} ${match.path ? homePath(match.path) : "(default)"}` : "none",
  );
} else {
  console.error("usage: node hook.ts session | which [folder]");
  process.exitCode = 1;
}
