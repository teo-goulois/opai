// "Sync now", from the app: what `opai sync` does every 10 minutes, at once,
// with the MCP servers and the skills committed first (it commits only what
// agents wrote). Then the tools' own configs get the servers it pulled, and
// the machines of machines.json run their own sync through SSH, so they get
// what this one pushed without waiting for theirs.

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { readMachines } from "./automations.ts";
import { thisMachine } from "./machines.ts";
import { syncQuietly } from "./mcp-sync.ts";
import { shareAll } from "./sharing.ts";
import { ENGINE } from "./spaces.ts";

/** What a sync did, here or on another machine. */
export type SyncOutcome = {
  pulled: number;
  pushed: number;
  /** Why it did not reach the remote, or stopped. */
  problem: string | undefined;
};

export type SyncResult = SyncOutcome & {
  /** The paths committed before the sync. */
  shared: string[];
  /** The tools' configs rewritten with global's servers. */
  configs: string[];
  /** The machines of machines.json, synced after this one. */
  machines: (SyncOutcome & { name: string })[];
};

/** Whether the 10-minute sync is running now: sync.sh then exits at once. */
function syncRunning(root: string) {
  const file = join(root, ".local", "sync.lock", "pid");
  if (!existsSync(file)) return false;
  try {
    process.kill(Number(readFileSync(file, "utf8").trim()), 0);
    return true;
  } catch {
    return false;
  }
}

/** A command's output lines, without sync.sh's dates; failed when it exits non-zero. */
function run(
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; input?: string },
) {
  return new Promise<{ log: string[]; failed: boolean }>((resolve) => {
    const child = execFile(
      command,
      args,
      { env: options.env, timeout: 150_000 },
      (error, stdout, stderr) => {
        const log = `${stdout}\n${stderr}`
          .split("\n")
          .map((line) => line.replace(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d /, "").trim())
          .filter(Boolean);
        resolve({ log: log.length > 0 || !error ? log : [error.message], failed: !!error });
      },
    );
    child.stdin?.end(options.input ?? "");
  });
}

/** What sync.sh's lines say it did. */
function outcome({ log, failed }: { log: string[]; failed: boolean }): SyncOutcome {
  const count = (verb: string) =>
    Number(new RegExp(`^${verb} (\\d+) commits`, "m").exec(log.join("\n"))?.[1] ?? 0);
  const stopped = log.find((line) => line.startsWith("Stopped: "))?.slice("Stopped: ".length);
  const problem =
    stopped ??
    log.find((line) => /^(Remote unreachable|Push failed|Skipped|Could not)/.test(line)) ??
    (failed ? log.at(-1) : undefined);
  return { pulled: count("Pulled"), pushed: count("Pushed"), problem };
}

// Run on another machine: start its sync, wait for it, and print what it
// logged meanwhile. Without -k: a sync already running is never killed.
const REMOTE_SYNC = `
log="$HOME/Library/Logs/opai/sync.log"
job="gui/$(id -u)/dev.opai.sync"
before=$(wc -l < "$log" 2>/dev/null || echo 0)
launchctl kickstart "$job" || { echo "Stopped: its automatic sync is not installed (opai sync --install)."; exit 0; }
sleep 1
i=0
while [ $i -lt 120 ] && launchctl print "$job" 2>/dev/null | grep -q "state = running"; do
  sleep 1
  i=$((i + 1))
done
tail -n +$((before + 1)) "$log" 2>/dev/null
`;

const syncMachine = async (machine: { name: string; ssh: string }) => ({
  name: machine.name,
  ...outcome(
    await run("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=5", machine.ssh, "sh -s"], {
      input: REMOTE_SYNC,
    }),
  ),
});

export async function syncNow(root: string): Promise<SyncResult> {
  const none = { shared: [], pulled: 0, pushed: 0, configs: [], machines: [] };
  if (syncRunning(root)) {
    return { ...none, problem: "A sync is already running: try again in a moment." };
  }
  let shared: string[];
  try {
    shared = shareAll(root);
  } catch (error) {
    return { ...none, problem: (error as Error).message };
  }
  const local = outcome(
    await run("sh", [join(ENGINE, "scripts", "sync.sh")], {
      env: { ...process.env, OPAI_HOME: root },
    }),
  );
  const tools = syncQuietly(root);
  const current = thisMachine();
  const machines = await Promise.all(
    readMachines(root)
      .filter((machine) => machine.name !== current)
      .map(syncMachine),
  );
  return {
    ...local,
    problem: local.problem ?? tools.error,
    shared,
    configs: tools.changed,
    machines,
  };
}
