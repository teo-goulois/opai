import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { Data, Effect } from "effect";

// File access for the app's procedures. Every failure is an InventoryError
// with the path, so the router can say which file it could not read or write.

export class InventoryError extends Data.TaggedError("InventoryError")<{
  path: string;
  cause: unknown;
}> {}

/** The file changed on disk after the client read it. */
export class StaleWrite extends Data.TaggedError("StaleWrite")<{ path: string }> {}

/** A change the files don't allow: a name already taken, a file that must stay. */
export class Refused extends Data.TaggedError("Refused")<{
  reason: "conflict" | "forbidden";
  message: string;
}> {}

export function isMissing(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export const readText = (path: string) =>
  Effect.tryPromise({
    try: () => readFile(path, "utf8"),
    catch: (cause) => new InventoryError({ path, cause }),
  });

/** The file's text, or undefined when it doesn't exist. */
export const readOptionalText = (path: string) =>
  readText(path).pipe(
    Effect.catchTag("InventoryError", (error) =>
      isMissing(error.cause) ? Effect.succeed(undefined) : Effect.fail(error),
    ),
  );

/** Entry names in `path` matching `keep`, sorted, or none when it doesn't exist. */
const listEntries = (
  path: string,
  keep: (entry: {
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
  }) => boolean,
) =>
  Effect.tryPromise({
    try: async () => {
      try {
        const entries = await readdir(path, { withFileTypes: true });
        return entries
          .filter(keep)
          .map((entry) => entry.name)
          .sort();
      } catch (error) {
        if (isMissing(error)) return [];
        throw error;
      }
    },
    catch: (cause) => new InventoryError({ path, cause }),
  });

/** Folder names in `path`, or none when it doesn't exist. */
export const listFolders = (path: string) =>
  listEntries(path, (entry) => entry.isDirectory() || entry.isSymbolicLink());

/** File names in `path`, or none when it doesn't exist. */
export const listFileNames = (path: string) =>
  listEntries(path, (entry) => entry.isFile() || entry.isSymbolicLink());

/** Regular file names in `path`, links left out, or none when it doesn't exist. */
export const listRegularFiles = (path: string) => listEntries(path, (entry) => entry.isFile());

/** Whether `path` is a symbolic link. */
export const isLink = (path: string) =>
  Effect.promise(() =>
    lstat(path).then(
      (stats) => stats.isSymbolicLink(),
      () => false,
    ),
  );

/** A short content hash, so a write can check nobody changed the file since it was read. */
export function hashText(text: string) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/**
 * Replaces an existing file in one step (write a sibling, then rename). A
 * symbolic link is refused: the rename would replace the link with a copy.
 */
export const writeText = (path: string, text: string) =>
  Effect.gen(function* () {
    if (yield* isLink(path)) {
      return yield* new Refused({
        reason: "forbidden",
        message: `${basename(path)} is a link: edit the file it points to.`,
      });
    }
    yield* Effect.tryPromise({
      try: async () => {
        const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
        await writeFile(temporary, text, "utf8");
        await rename(temporary, path);
      },
      catch: (cause) => new InventoryError({ path, cause }),
    });
  });

/** Writes a new file, creating its folders; fails with Refused when it exists. */
export const createText = (path: string, text: string, label = path) =>
  Effect.tryPromise({
    try: async () => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, text, { encoding: "utf8", flag: "wx" });
    },
    catch: (cause) =>
      cause instanceof Error && "code" in cause && cause.code === "EEXIST"
        ? new Refused({ reason: "conflict", message: `${label} already exists.` })
        : new InventoryError({ path, cause }),
  });
