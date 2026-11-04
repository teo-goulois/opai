import GithubSlugger from "github-slugger";
import { parse as parseYaml } from "yaml";

// Small, dependency-light helpers to read Markdown documents of the instance.

export type Heading = {
  depth: number;
  title: string;
  /** The id rehype-slug gives the rendered heading (GitHub style). */
  id: string;
};

/** Splits a leading YAML frontmatter block from the body. */
export function splitFrontmatter(markdown: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
  if (!match) return { frontmatter: {}, body: markdown };
  let data: unknown;
  try {
    data = parseYaml(match[1] ?? "");
  } catch {
    data = undefined;
  }
  const frontmatter =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  return { frontmatter, body: markdown.slice(match[0].length) };
}

/** Inline Markdown to plain text, enough for headings and short summaries. */
export function plainText(markdown: string) {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`/g, "")
    .replace(/(\*\*|__|~~)(.+?)\1/g, "$2")
    .replace(/\s+/g, " ")
    .trim();
}

/** ATX headings outside code fences, with the ids the renderer will use. */
export function outline(body: string): Heading[] {
  const slugger = new GithubSlugger();
  const headings: Heading[] = [];
  let fence: string | null = null;

  for (const line of body.split(/\r?\n/)) {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line);
    if (fenceMatch?.[1]) {
      const marker = fenceMatch[1].charAt(0);
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;

    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!heading?.[1] || !heading[2]) continue;
    const title = plainText(heading[2]);
    headings.push({ depth: heading[1].length, title, id: slugger.slug(title) });
  }

  return headings;
}

/** The first paragraph after the title, as plain text. */
export function lead(body: string): string {
  const blocks = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const paragraph = blocks.find((block) => !/^(#|```|~~~|[-*+] |\d+\. |\||>|<)/.test(block));
  return paragraph ? plainText(paragraph) : "";
}

export type Block = Heading & {
  /** Character offsets of the block: its heading line up to the next heading of the same or a higher level. */
  start: number;
  end: number;
  /** Offset where the block's own text ends (its first sub-heading, or `end`). */
  ownEnd: number;
};

/** Every heading with the slice of the document it owns. */
export function blocks(body: string): Block[] {
  const slugger = new GithubSlugger();
  const found: { depth: number; title: string; id: string; start: number }[] = [];
  let fence: string | null = null;
  let offset = 0;

  for (const line of body.split("\n")) {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line);
    if (fenceMatch?.[1]) {
      const marker = fenceMatch[1].charAt(0);
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
    } else if (fence === null) {
      const heading = /^(#{1,6})\s+(.+?)\s*#*\s*\r?$/.exec(line);
      if (heading?.[1] && heading[2]) {
        const title = plainText(heading[2]);
        found.push({ depth: heading[1].length, title, id: slugger.slug(title), start: offset });
      }
    }
    offset += line.length + 1;
  }

  return found.map((heading, index) => {
    const next = found.slice(index + 1);
    const end = next.find((other) => other.depth <= heading.depth)?.start ?? body.length;
    const ownEnd = Math.min(next[0]?.start ?? body.length, end);
    return { ...heading, end, ownEnd };
  });
}
