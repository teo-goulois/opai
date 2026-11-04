import { existsSync, readdirSync, readFileSync } from "node:fs";
import { chmod, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { Data, Effect, Semaphore } from "effect";

import { hashText } from "../files.ts";
import { splitFrontmatter } from "../markdown/document.ts";
import { renderBlocks } from "./blocks.ts";
import { handbookFolder, readHandbookConfig, type HandbookConfig } from "./config.ts";
import {
  baseBranch,
  baseRef,
  fetchClone,
  git,
  HandbookCommandFailed,
  HandbookNotPublishable,
  handbookPaths,
  isCloned,
  repoLock,
  run,
  type HandbookCommit,
  type HandbookPaths,
} from "./repo.ts";

// Publishes the instance's handbook into the repository handbook.json names.
// On top of origin/main in the app's clone, the export replaces the folder
// `publish.path` with the handbook's files (pages with their blocks filled,
// handbook.json, anything else as-is), then runs `publish.build` for the files
// the site derives from them. A preview shows the diff; publishing commits it
// on a new branch, pushes the branch, and opens a pull request. Nothing
// reaches main until the owner merges it.

/** The changes differ from the preview the user approved. */
export class HandbookPublishChanged extends Data.TaggedError("HandbookPublishChanged")<{}> {}

export type ChangedFile = { path: string; additions: number; deletions: number };

export type PublishPullRequest = { number: number; title: string; url: string; branch: string };

export type PublishPreview = {
  base: HandbookCommit;
  files: ChangedFile[];
  /** Unified diff of every change, empty when the site is up to date. */
  diff: string;
  /** Sent back to publish exactly this diff. */
  diffHash: string;
  /** Open publish pull requests; null when gh could not list them. */
  pullRequests: PublishPullRequest[] | null;
};

export type PublishResult =
  | { status: "up-to-date" }
  | { status: "opened"; branch: string; url: string; files: ChangedFile[] };

const BRANCH_PREFIX = "handbook/publish-";

type Target = NonNullable<HandbookConfig["publish"]>;

const target = (root: string) =>
  Effect.gen(function* () {
    const config = readHandbookConfig(root);
    if (!config?.publish) return yield* Effect.fail(new HandbookNotPublishable());
    return { config, publish: config.publish };
  });

/** A clean checkout of origin/main, without any branch of the publish's left. */
const resetClone = (paths: HandbookPaths) =>
  Effect.gen(function* () {
    yield* git(paths, ["checkout", "--quiet", "--force", "--detach", baseRef]);
    yield* git(paths, ["clean", "-fdq"]);
  });

/**
 * The clone has no node_modules, so `oxfmt` in the build is a shim that runs
 * the version pinned in the repository's lockfile.
 */
const formatterShim = (paths: HandbookPaths) =>
  Effect.gen(function* () {
    const lockfile = join(paths.repo, "pnpm-lock.yaml");
    const lock = existsSync(lockfile)
      ? yield* Effect.promise(() => readFile(lockfile, "utf8"))
      : "";
    const version = /^ {2}oxfmt@(\d[\w.-]*):/m.exec(lock)?.[1] ?? "latest";
    const shim = join(paths.bin, "oxfmt");
    const text = `#!/bin/sh\nexec pnpm dlx "oxfmt@${version}" "$@"\n`;
    yield* Effect.promise(async () => {
      await mkdir(paths.bin, { recursive: true });
      if (!existsSync(shim) || (await readFile(shim, "utf8")) !== text) {
        await writeFile(shim, text);
        await chmod(shim, 0o755);
      }
    });
  });

/** Runs one script of a package.json the way pnpm would, without an install. */
const runBuild = (paths: HandbookPaths, build: NonNullable<Target["build"]>) =>
  Effect.gen(function* () {
    const cwd = join(paths.repo, build.cwd);
    const manifest = JSON.parse(
      yield* Effect.promise(() => readFile(join(cwd, "package.json"), "utf8")),
    ) as { scripts?: Record<string, string> };
    const script = manifest.scripts?.[build.script];
    if (!script) {
      return yield* Effect.fail(
        new HandbookCommandFailed({
          command: build.script,
          output: `No ${build.script} script in ${build.cwd}/package.json.`,
        }),
      );
    }
    yield* formatterShim(paths);
    yield* run("sh", ["-c", script], {
      cwd,
      timeout: 5 * 60_000,
      env: { NODE_NO_WARNINGS: "1", PATH: `${paths.bin}:${process.env.PATH ?? ""}` },
    });
  });

/** Every file of a folder, relative to it. */
function files(folder: string, below = ""): string[] {
  return readdirSync(join(folder, below), { withFileTypes: true }).flatMap((entry) => {
    const path = below ? `${below}/${entry.name}` : entry.name;
    return entry.isDirectory() ? files(folder, path) : [path];
  });
}

/** Writes the handbook into `publish.path` of the clone, pages with their blocks filled. */
const exportHandbook = (root: string, config: HandbookConfig, paths: HandbookPaths, path: string) =>
  Effect.promise(async () => {
    const source = handbookFolder(root);
    const destination = join(paths.repo, path);
    await rm(destination, { recursive: true, force: true });
    for (const file of files(source)) {
      const to = join(destination, file);
      await mkdir(dirname(to), { recursive: true });
      if (!file.endsWith(".md")) {
        await cp(join(source, file), to);
        continue;
      }
      const text = readFileSync(join(source, file), "utf8");
      const { body } = splitFrontmatter(text);
      const filled = renderBlocks(root, body, config).markdown;
      await writeFile(to, text.slice(0, text.length - body.length) + filled);
    }
  });

/** Exports the handbook on top of origin/main, builds, and stages the result. */
const generate = (root: string, config: HandbookConfig, publish: Target, paths: HandbookPaths) =>
  Effect.gen(function* () {
    const base = yield* fetchClone(paths, publish.repo);
    yield* resetClone(paths);
    yield* exportHandbook(root, config, paths, publish.path);
    if (publish.build) yield* runBuild(paths, publish.build);
    yield* git(paths, ["add", "--all"]);

    const changed = (yield* git(paths, ["diff", "--cached", "--numstat"]))
      .split("\n")
      .filter(Boolean)
      .map((line): ChangedFile => {
        const [additions = "0", deletions = "0", ...path] = line.split("\t");
        return {
          path: path.join("\t"),
          additions: Number(additions) || 0,
          deletions: Number(deletions) || 0,
        };
      });
    const diff = yield* git(paths, ["diff", "--cached", "--no-color"]);
    return { base, files: changed, diff, diffHash: hashText(diff) };
  });

const listPullRequests = (paths: HandbookPaths) =>
  run(
    "gh",
    ["pr", "list", "--state", "open", "--limit", "50", "--json", "number,title,url,headRefName"],
    { cwd: paths.repo, timeout: 30_000 },
  ).pipe(
    Effect.map((output) =>
      (JSON.parse(output) as { number: number; title: string; url: string; headRefName: string }[])
        .filter((pr) => pr.headRefName.startsWith(BRANCH_PREFIX))
        .map(({ number, title, url, headRefName }) => ({
          number,
          title,
          url,
          branch: headRefName,
        })),
    ),
    Effect.catch(() => Effect.succeed(null)),
  );

/** What publishing would change, without changing anything. */
export const previewPublish = (root: string) =>
  Effect.gen(function* () {
    const { config, publish } = yield* target(root);
    const paths = handbookPaths(root);
    const generated = yield* generate(root, config, publish, paths).pipe(
      Effect.ensuring(isCloned(paths) ? resetClone(paths).pipe(Effect.ignore) : Effect.void),
    );
    const preview: PublishPreview = { ...generated, pullRequests: yield* listPullRequests(paths) };
    return preview;
  }).pipe(Semaphore.withPermit(repoLock));

function branchName(now: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${BRANCH_PREFIX}${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function pullRequestBody(files: ChangedFile[]) {
  return [
    "Publishes the handbook from its Opai instance: the pages, with their generated blocks filled, then the site's build.",
    "",
    ...files.map((file) => `- \`${file.path}\` (+${file.additions} −${file.deletions})`),
    "",
    "Merge once CI passes.",
  ].join("\n");
}

/**
 * Commits the export on a new branch, pushes it, and opens a pull request.
 * `diffHash` comes from the preview: a different diff is not published.
 */
export const publishHandbook = (root: string, diffHash: string) =>
  Effect.gen(function* () {
    const { config, publish } = yield* target(root);
    const paths = handbookPaths(root);
    const generated = yield* generate(root, config, publish, paths);
    if (generated.files.length === 0) return { status: "up-to-date" } satisfies PublishResult;
    if (generated.diffHash !== diffHash) return yield* Effect.fail(new HandbookPublishChanged());

    const branch = branchName(new Date());
    const title = "docs: publish the handbook";
    yield* git(paths, ["switch", "--quiet", "--create", branch]);
    yield* git(paths, [
      "commit",
      "--quiet",
      "--message",
      title,
      "--message",
      "Exported from the handbook of the Opai instance.",
    ]);
    yield* git(paths, ["push", "--quiet", "--set-upstream", "origin", branch], {
      timeout: 2 * 60_000,
    });
    const url = (yield* run(
      "gh",
      [
        "pr",
        "create",
        "--base",
        baseBranch,
        "--head",
        branch,
        "--title",
        title,
        "--body",
        pullRequestBody(generated.files),
      ],
      { cwd: paths.repo, timeout: 60_000 },
    ).pipe(
      Effect.mapError(
        (error) =>
          new HandbookCommandFailed({
            command: error.command,
            output: `${error.output}\nThe branch ${branch} is pushed: open its pull request on GitHub.`,
          }),
      ),
    ))
      .trim()
      .split("\n")
      .at(-1);
    const result: PublishResult = {
      status: "opened",
      branch,
      url: url ?? "",
      files: generated.files,
    };
    return result;
  }).pipe(
    Effect.ensuring(
      Effect.gen(function* () {
        const paths = handbookPaths(root);
        if (!isCloned(paths)) return;
        yield* resetClone(paths);
        // The branch lives on in origin; the clone keeps none.
        const branches = (yield* git(paths, [
          "branch",
          "--format=%(refname:short)",
          "--list",
          `${BRANCH_PREFIX}*`,
        ]))
          .split("\n")
          .filter(Boolean);
        if (branches.length > 0) yield* git(paths, ["branch", "--quiet", "-D", ...branches]);
      }).pipe(Effect.ignore),
    ),
    Semaphore.withPermit(repoLock),
  );
