import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

import { Data, Effect, Semaphore } from "effect";

// The app's own clone of the repository the handbook is published into
// (handbook.json's `publish.repo`). The owner's working copy may hold
// uncommitted work, so the app never touches it: it clones the repository
// once and works on origin/main there.
//
//   <dir>/repo   the clone; only publish.ts checks out or commits
//   <dir>/bin    a shim for the repository's formatter (see publish.ts)
//
// <dir> is HANDBOOK_DIR, or .local/handbook in the instance (ignored by Git).

const BASE = "main";
export const baseRef = `origin/${BASE}`;
export const baseBranch = BASE;

export type HandbookPaths = { dir: string; repo: string; bin: string };

export function handbookPaths(root: string): HandbookPaths {
  const dir = process.env.HANDBOOK_DIR ?? join(root, ".local", "handbook");
  return { dir, repo: join(dir, "repo"), bin: join(dir, "bin") };
}

/** handbook.json names no repository to publish into. */
export class HandbookNotPublishable extends Data.TaggedError("HandbookNotPublishable")<{}> {}

/** A git, gh, or build command failed. `output` is its last lines of stderr. */
export class HandbookCommandFailed extends Data.TaggedError("HandbookCommandFailed")<{
  command: string;
  output: string;
}> {}

/** One clone, one operation at a time. */
export const repoLock = Semaphore.makeUnsafe(1);

export type RunOptions = {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
};

/** Runs a command and returns its stdout. Never goes through a shell unless asked. */
export const run = (file: string, args: readonly string[], options: RunOptions = {}) =>
  Effect.tryPromise({
    try: () =>
      new Promise<string>((resolve, reject) => {
        execFile(
          file,
          args,
          {
            cwd: options.cwd,
            env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...options.env },
            timeout: options.timeout ?? 60_000,
            maxBuffer: 32 * 1024 * 1024,
          },
          (error, stdout, stderr) => {
            if (error) reject(Object.assign(error, { stderr }));
            else resolve(stdout);
          },
        );
      }),
    catch: (cause) =>
      new HandbookCommandFailed({
        command: [file, ...args.filter((arg) => !arg.includes("\n"))].join(" ").slice(0, 200),
        output: lastLines(
          cause && typeof cause === "object" && "stderr" in cause && cause.stderr
            ? String(cause.stderr)
            : cause instanceof Error
              ? cause.message
              : String(cause),
        ),
      }),
  });

function lastLines(text: string) {
  return text.trim().split("\n").slice(-6).join("\n");
}

export const git = (paths: HandbookPaths, args: readonly string[], options: RunOptions = {}) =>
  run("git", ["-C", paths.repo, ...args], options);

export type HandbookCommit = { sha: string; date: string; subject: string };

const isCloned = (paths: HandbookPaths) => existsSync(join(paths.repo, ".git"));

/** Clones the repository when there is no clone yet, then fetches origin. */
export const fetchClone = (paths: HandbookPaths, remote: string) =>
  Effect.gen(function* () {
    if (!isCloned(paths)) {
      const partial = `${paths.repo}.partial`;
      yield* Effect.promise(async () => {
        await mkdir(paths.dir, { recursive: true });
        await rm(partial, { recursive: true, force: true });
      });
      yield* run("git", ["clone", "--quiet", "--filter=blob:none", remote, partial], {
        timeout: 10 * 60_000,
      });
      yield* Effect.promise(() => rename(partial, paths.repo));
    }
    yield* git(paths, ["fetch", "--quiet", "--prune", "origin"], { timeout: 2 * 60_000 });
    const [sha = "", date = "", subject = ""] = (yield* git(paths, [
      "log",
      "-1",
      "--format=%H%n%cI%n%s",
      baseRef,
    ]))
      .trim()
      .split("\n");
    const commit: HandbookCommit = { sha, date, subject };
    return commit;
  });

export { isCloned };
