import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

// The handbook lives in handbook/ at the root of the instance: one Markdown
// page per file (index.md is the home page, stack/index.md the page "stack"),
// and handbook.json for what the files don't say:
//
// - site: the published handbook's root URL, for links between pages
// - publish: the repository and folder `publish.ts` copies the pages into
// - sections: the table of contents, pages and external links
// - pages: per-page settings passed through to the site (`install`)
// - skills: how the `opai:skills` block groups the skills (blocks.ts)

const Depth = z.number().int().min(0).max(4).optional();

const Entry = z.union([
  z.object({ page: z.string(), depth: Depth }),
  z.object({
    title: z.string().min(1),
    href: z.string().min(1),
    description: z.string().default(""),
    markdownPath: z.string().optional(),
    depth: Depth,
  }),
]);

export const HandbookConfig = z.object({
  site: z.url().optional(),
  publish: z
    .object({
      repo: z.string().min(1),
      path: z.string().min(1),
      /** A script of the package.json in `cwd`, run after the copy (no install needed). */
      build: z.object({ cwd: z.string().default("."), script: z.string().min(1) }).optional(),
    })
    .optional(),
  sections: z.array(z.object({ title: z.string().min(1), entries: z.array(Entry) })).default([]),
  pages: z.record(z.string(), z.looseObject({ install: z.string().optional() })).default({}),
  skills: z
    .object({
      groups: z.array(z.object({ title: z.string().min(1), skills: z.array(z.string()) })),
    })
    .optional(),
});
export type HandbookConfig = z.infer<typeof HandbookConfig>;

export const handbookFolder = (root: string) => join(root, "handbook");

/** handbook.json, empty when the file is missing; undefined when the instance has no handbook/. */
export function readHandbookConfig(root: string): HandbookConfig | undefined {
  const folder = handbookFolder(root);
  if (!existsSync(folder)) return undefined;
  const file = join(folder, "handbook.json");
  return HandbookConfig.parse(existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {});
}

/** The file of a page slug: "" is index.md, "stack" is stack/index.md when it exists, else stack.md. */
export function pageFile(folder: string, slug: string) {
  if (slug === "") return "index.md";
  return existsSync(join(folder, slug, "index.md")) ? `${slug}/index.md` : `${slug}.md`;
}

/** The slug of a page file, the reverse of `pageFile`. */
export function pageSlug(file: string) {
  return file.replace(/\.md$/, "").replace(/(^|\/)index$/, "");
}
