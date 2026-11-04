// The user's memory: one Markdown file per fact, in spaces/<name>/context/memory/.
// Agents read it here; nothing in this module writes.

import { readdir, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

import { Data, Effect } from "effect";

import { spaceFolders } from "./spaces.ts";

export class MemoryNotFound extends Data.TaggedError("MemoryNotFound")<{ path: string }> {}

/** A path outside the memory folders, or not a Markdown file. */
export class OutsideMemory extends Data.TaggedError("OutsideMemory")<{ path: string }> {}

export class ReadFailed extends Data.TaggedError("ReadFailed")<{ path: string; cause: unknown }> {}

export type Fact = {
  /** Path from the instance root, what memory_get takes. */
  path: string;
  space: string;
  title: string;
};

export type Hit = Fact & {
  /** How many of the query's words the fact contains. */
  score: number;
  /** The first line holding one of the words. */
  excerpt: string;
};

function isMissing(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Lowercase, without accents, so "facturation" finds "Facturation" and "regle" finds "règle". */
function fold(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function titleOf(text: string, fallback: string) {
  const heading = text.split("\n").find((line) => line.startsWith("# "));
  return heading ? heading.slice(2).trim() : fallback;
}

const readText = (path: string) =>
  Effect.tryPromise({
    try: () => readFile(path, "utf8"),
    catch: (cause) =>
      isMissing(cause) ? new MemoryNotFound({ path }) : new ReadFailed({ path, cause }),
  });

/** The Markdown files of one memory folder, or none when it doesn't exist. */
const listFacts = (folder: string) =>
  Effect.tryPromise({
    try: async () => {
      try {
        const entries = await readdir(folder, { withFileTypes: true });
        return entries
          .filter(
            (entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md",
          )
          .map((entry) => join(folder, entry.name))
          .sort();
      } catch (error) {
        if (isMissing(error)) return [];
        throw error;
      }
    },
    catch: (cause) => new ReadFailed({ path: folder, cause }),
  });

/** The memory of a space, then the global one. */
function memoryFolders(root: string, space: string) {
  const names = space === "global" ? ["global"] : [space, "global"];
  return names.map((name) => ({ space: name, folder: spaceFolders(root, name).memory }));
}

/** Facts of the space and of global holding the query's words, best first. */
export const searchMemory = (root: string, space: string, query: string, limit: number) =>
  Effect.gen(function* () {
    const words = [
      ...new Set(
        fold(query)
          .split(/[^\p{L}\p{N}]+/u)
          .filter((word) => word.length > 1),
      ),
    ];
    const hits: Hit[] = [];
    for (const { space: owner, folder } of memoryFolders(root, space)) {
      for (const file of yield* listFacts(folder)) {
        const text = yield* readText(file);
        const folded = fold(text);
        const found = words.filter((word) => folded.includes(word));
        if (words.length > 0 && found.length === 0) continue;
        const line =
          text
            .split("\n")
            .find((candidate) => found.some((word) => fold(candidate).includes(word))) ?? "";
        hits.push({
          path: relative(root, file),
          space: owner,
          title: titleOf(text, relative(folder, file)),
          score: found.length,
          excerpt: line.trim().slice(0, 240),
        });
      }
    }
    return hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, limit);
  });

/** One fact, by its path from the root. Only files under spaces/<name>/context/memory/. */
export const getMemory = (root: string, path: string) =>
  Effect.gen(function* () {
    const file = join(root, path);
    // Refuse a path that leaves the memory folders before looking at the disk,
    // so the answer says nothing about files elsewhere.
    if (isAbsolute(path) || !path.endsWith(".md") || !inMemory(join(root, "spaces"), file)) {
      return yield* new OutsideMemory({ path });
    }
    // Then resolve links, and check where the file really is.
    const real = yield* Effect.tryPromise({
      try: () => realpath(file),
      catch: (cause) =>
        isMissing(cause) ? new MemoryNotFound({ path }) : new ReadFailed({ path, cause }),
    });
    const spaces = yield* Effect.tryPromise({
      try: () => realpath(join(root, "spaces")),
      catch: (cause) => new ReadFailed({ path: "spaces", cause }),
    });
    const parts = inMemory(spaces, real);
    if (!parts) return yield* new OutsideMemory({ path });
    const text = yield* readText(real);
    return { path, space: parts[0] ?? "", title: titleOf(text, path), text };
  });

/** The parts of `file` under `spaces` when it is spaces/<name>/context/memory/<...>. */
function inMemory(spaces: string, file: string) {
  const parts = relative(spaces, file).split(sep);
  const inside =
    parts.length >= 4 && parts[0] !== ".." && parts[1] === "context" && parts[2] === "memory";
  return inside ? parts : undefined;
}
