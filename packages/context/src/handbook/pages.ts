import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { Data, Effect } from "effect";
import { z } from "zod";

import { hashText, readText, StaleWrite, writeText } from "../files.ts";
import { outline, splitFrontmatter, type Heading } from "../markdown/document.ts";
import { renderBlocks } from "./blocks.ts";
import {
  handbookFolder,
  pageFile,
  pageSlug,
  readHandbookConfig,
  type HandbookConfig,
} from "./config.ts";

// The handbook of the instance (handbook/), read and edited in place. The
// blocks filled from the instance (blocks.ts) are filled on every read.
// publish.ts copies the pages to the site.

export class HandbookPageNotFound extends Data.TaggedError("HandbookPageNotFound")<{
  slug: string;
}> {}

/** A page slug: "stack/api". The home page is "index". */
export const HandbookSlug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/, "A handbook page slug");

export type HandbookPageSummary = {
  slug: string;
  title: string;
  description: string;
  /** Relative to the instance. */
  path: string;
  /** The published page, when handbook.json names a site. */
  url?: string;
  /** Holds blocks filled from the instance (opai:skills, opai:include). */
  generated?: true;
};

export type HandbookEntry =
  | { kind: "page"; depth: number; page: HandbookPageSummary }
  | { kind: "link"; depth: number; title: string; description: string; url: string };

export type Handbook =
  | { status: "missing" }
  | {
      status: "ready";
      /** The published handbook's root URL. */
      site?: string;
      /** handbook.json names where to publish. */
      publishable: boolean;
      sections: { title: string; entries: HandbookEntry[] }[];
      pages: HandbookPageSummary[];
    };

export type HandbookPage = HandbookPageSummary & {
  /** The page without its frontmatter, blocks filled. */
  markdown: string;
  /** Hash of `markdown`, sent back with an edit. */
  hash: string;
  sections: Heading[];
};

/** The app's slug for a handbook slug: the home page ("") becomes "index". */
const toAppSlug = (slug: string) => slug || "index";
const fromAppSlug = (slug: string) => (slug === "index" ? "" : slug);

/** Every page file of the handbook folder, relative to it. */
function pageFiles(folder: string, below = ""): string[] {
  return readdirSync(join(folder, below), { withFileTypes: true })
    .flatMap((entry) => {
      const path = below ? `${below}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return pageFiles(folder, path);
      return entry.name.endsWith(".md") ? [path] : [];
    })
    .sort();
}

/** The site URL of a page: the root for the home page. */
export function pageUrl(config: HandbookConfig, slug: string) {
  if (!config.site) return undefined;
  return slug ? `${config.site.replace(/\/$/, "")}/${slug}` : config.site;
}

type ReadPage = { summary: HandbookPageSummary; frontmatter: string; body: string };

function readPage(root: string, config: HandbookConfig, file: string): ReadPage {
  const source = readFileSync(join(handbookFolder(root), file), "utf8");
  const { frontmatter, body } = splitFrontmatter(source);
  const rendered = renderBlocks(root, body, config);
  const slug = pageSlug(file);
  const url = pageUrl(config, slug);
  return {
    summary: {
      slug: toAppSlug(slug),
      title: typeof frontmatter.title === "string" ? frontmatter.title : slug || "Handbook",
      description: typeof frontmatter.description === "string" ? frontmatter.description : "",
      path: relative(root, join(handbookFolder(root), file)),
      ...(url ? { url } : {}),
      ...(rendered.generated ? { generated: true as const } : {}),
    },
    frontmatter: source.slice(0, source.length - body.length),
    body: rendered.markdown,
  };
}

/** The handbook's contents: handbook.json's sections, then the pages none lists. */
export const getHandbook = (root: string) =>
  Effect.sync((): Handbook => {
    const config = readHandbookConfig(root);
    if (!config) return { status: "missing" };
    const folder = handbookFolder(root);
    const pages = new Map(
      pageFiles(folder).map((file) => [pageSlug(file), readPage(root, config, file).summary]),
    );
    const listed = new Set<string>();
    const site = config.site ? new URL(config.site) : undefined;
    const sections = config.sections.map((section) => ({
      title: section.title,
      entries: section.entries.flatMap((entry): HandbookEntry[] => {
        const depth = entry.depth ?? 0;
        if ("page" in entry) {
          const page = pages.get(entry.page);
          if (!page) return [];
          listed.add(entry.page);
          return [{ kind: "page", depth, page }];
        }
        const url = site ? new URL(entry.href, site.origin).href : entry.href;
        return [{ kind: "link", depth, title: entry.title, description: entry.description, url }];
      }),
    }));
    const unlisted = [...pages].filter(([slug]) => !listed.has(slug));
    if (unlisted.length > 0) {
      sections.push({
        title: "Other pages",
        entries: unlisted.map(([, page]) => ({ kind: "page", depth: 0, page })),
      });
    }
    return {
      status: "ready",
      ...(config.site ? { site: config.site } : {}),
      publishable: config.publish !== undefined,
      sections,
      pages: [...pages.values()],
    };
  });

const findPage = (root: string, slug: string) =>
  Effect.gen(function* () {
    const config = readHandbookConfig(root);
    const folder = handbookFolder(root);
    const file = config ? pageFile(folder, fromAppSlug(slug)) : undefined;
    if (
      !config ||
      !file ||
      !existsSync(join(folder, file)) ||
      !statSync(join(folder, file)).isFile()
    ) {
      return yield* Effect.fail(new HandbookPageNotFound({ slug }));
    }
    return { config, file, page: readPage(root, config, file) };
  });

export const getHandbookPage = (root: string, slug: string) =>
  findPage(root, slug).pipe(
    Effect.map(({ page }): HandbookPage => ({
      ...page.summary,
      markdown: page.body,
      hash: hashText(page.body),
      sections: outline(page.body),
    })),
  );

/** Replaces a page's body, keeping its frontmatter, if nobody changed it since `baseHash`. */
export const updateHandbookPage = (
  root: string,
  slug: string,
  markdown: string,
  baseHash: string,
) =>
  Effect.gen(function* () {
    const { file, page } = yield* findPage(root, slug);
    if (hashText(page.body) !== baseHash) return yield* new StaleWrite({ path: page.summary.path });
    const path = join(handbookFolder(root), file);
    // Read again: the frontmatter as it is on disk, not as parsed.
    const source = yield* readText(path);
    const frontmatter = source.slice(0, source.length - splitFrontmatter(source).body.length);
    const body = `${markdown.trim()}\n`;
    yield* writeText(path, frontmatter ? `${frontmatter.replace(/\n*$/, "\n")}\n${body}` : body);
    return yield* getHandbookPage(root, slug);
  });
