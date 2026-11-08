// "Sync now", from the app: what `opai sync` does every 10 minutes, at once,
// with the MCP servers and the skills committed first (it commits only what
// agents wrote). Then the tools' own configs get the servers it pulled.

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { syncQuietly } from "./mcp-sync.ts";
import { shareAll } from "./sharing.ts";
import { ENGINE } from "./spaces.ts";

export type SyncResult = {
  /** The paths committed before the sync. */
  shared: string[];
  pulled: number;
  pushed: number;
  /** The tools' configs rewritten with global's servers. */
  configs: string[];
  /** Why the sync did not reach the remote, or stopped. */
  problem: string | undefined;
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

/** sync.sh's lines, without their date. */
const lines = (out: string) =>
  out
    .split("\n")
    .map((line) => line.replace(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d /, "").trim())
    .filter(Boolean);

const count = (log: string[], verb: string) =>
  Number(new RegExp(`^${verb} (\\d+) commits`, "m").exec(log.join("\n"))?.[1] ?? 0);

const stopped = (problem: string): SyncResult => ({
  shared: [],
  pulled: 0,
  pushed: 0,
  configs: [],
  problem,
});

export async function syncNow(root: string): Promise<SyncResult> {
  if (syncRunning(root)) return stopped("A sync is already running: try again in a moment.");
  let shared: string[];
  try {
    shared = shareAll(root);
  } catch (error) {
    return stopped((error as Error).message);
  }
  let log: string[];
  let failed = false;
  try {
    const { stdout, stderr } = await promisify(execFile)(
      "sh",
      [join(ENGINE, "scripts", "sync.sh")],
      { env: { ...process.env, OPAI_HOME: root }, timeout: 120_000 },
    );
    log = lines(`${stdout}\n${stderr}`);
  } catch (error) {
    const {
      stdout = "",
      stderr = "",
      message,
    } = error as { stdout?: string; stderr?: string; message: string };
    log = lines(`${stdout}\n${stderr}`);
    if (log.length === 0) log = [message];
    failed = true;
  }
  const problem = failed
    ? (log.find((line) => line.startsWith("Stopped:"))?.slice("Stopped: ".length) ?? log.at(-1))
    : log.find((line) => /^(Remote unreachable|Push failed|Skipped|Could not)/.test(line));
  const tools = syncQuietly(root);
  return {
    shared,
    pulled: count(log, "Pulled"),
    pushed: count(log, "Pushed"),
    configs: tools.changed,
    problem: problem ?? tools.error,
  };
}
