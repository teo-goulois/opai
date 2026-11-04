import { markdownLinkClassName, type MarkdownComponents } from "@opai/ui/components/ui/markdown";
import { cn } from "@opai/ui/lib/utils";
import { Link } from "@tanstack/react-router";

/**
 * Where a link of a handbook page goes in this app. `site` is the published
 * handbook's root (https://example.com/code): a link under its path is
 * another page and stays here, any other path on its host opens the site.
 */
export function resolveHandbookHref(
  href: string | undefined,
  site: string | undefined,
):
  | { kind: "page"; slug: string; hash?: string }
  | { kind: "url"; href: string; external: boolean } {
  if (!href) return { kind: "url", href: "", external: false };
  if (!site || !href.startsWith("/")) return { kind: "url", href, external: /^https?:/.test(href) };
  const { origin, pathname } = new URL(site);
  const base = pathname.replace(/\/$/, "");
  const [path = "", hash] = href.split("#");
  if (path === base || path.startsWith(`${base}/`)) {
    const slug = path.slice(base.length + 1) || "index";
    return { kind: "page", slug, ...(hash ? { hash } : {}) };
  }
  return { kind: "url", href: `${origin}${href}`, external: true };
}

/** Markdown components for a handbook page published under `site`. */
export const handbookMarkdownComponents = (site: string | undefined): MarkdownComponents => ({
  a: ({ node: _node, href, className, children, ...props }) => {
    const target = resolveHandbookHref(href, site);
    if (target.kind === "page") {
      return (
        <Link
          to="/handbook/$"
          params={{ _splat: target.slug }}
          hash={target.hash}
          className={cn(markdownLinkClassName, className)}
        >
          {children}
        </Link>
      );
    }
    return (
      <a
        href={target.href}
        className={cn(markdownLinkClassName, className)}
        {...(target.external ? { target: "_blank", rel: "noreferrer" } : {})}
        {...props}
      >
        {children}
      </a>
    );
  },
});
