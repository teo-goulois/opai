import { cn } from "@opai/ui/lib/utils";
import type * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

export type { Components as MarkdownComponents } from "react-markdown";

// Read-only Markdown (GitHub flavor) in the theme's type roles. Raw HTML is not
// rendered. Headings get GitHub-style ids, so "#section" links work.
// No Graphical specification: text uses the UI font at M, code the data font.

/** The look of a link in Markdown, for a custom `a` that keeps it. */
export const markdownLinkClassName = cn(
  "rounded-xs text-neutral-10 underline decoration-neutral-5 underline-offset-4",
  "transition-colors hover:decoration-neutral-10",
);

const defaultComponents: Components = {
  h1: ({ node: _node, className, ...props }) => (
    <h1 className={cn("font-brand text-l font-medium text-neutral-10", className)} {...props} />
  ),
  h2: ({ node: _node, className, ...props }) => (
    <h2
      className={cn(
        "scroll-mt-l pt-l font-brand text-m font-heavy text-neutral-10 edge-top edge-neutral-4",
        className,
      )}
      {...props}
    />
  ),
  h3: ({ node: _node, className, ...props }) => (
    <h3
      className={cn("scroll-mt-l font-brand text-m font-medium text-neutral-10", className)}
      {...props}
    />
  ),
  h4: ({ node: _node, className, ...props }) => (
    <h4
      className={cn("scroll-mt-l font-ui text-s font-medium text-neutral-7", className)}
      {...props}
    />
  ),
  a: ({ node: _node, className, href, ...props }) => {
    const external = href?.startsWith("http");
    return (
      <a
        href={href}
        className={cn(markdownLinkClassName, className)}
        {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
        {...props}
      />
    );
  },
  ul: ({ node: _node, className, ...props }) => (
    <ul className={cn("list-disc space-y-xxs ps-l marker:text-neutral-6", className)} {...props} />
  ),
  ol: ({ node: _node, className, ...props }) => (
    <ol
      className={cn("list-decimal space-y-xxs ps-l marker:text-neutral-7", className)}
      {...props}
    />
  ),
  li: ({ node: _node, className, ...props }) => (
    <li className={cn("ps-xxs [&>ul]:mt-xxs [&>ol]:mt-xxs", className)} {...props} />
  ),
  blockquote: ({ node: _node, className, ...props }) => (
    <blockquote
      className={cn("ps-m text-neutral-7 edge-start edge-neutral-4", className)}
      {...props}
    />
  ),
  hr: ({ node: _node, className, ...props }) => (
    <hr className={cn("h-xxs border-0 edge-top edge-neutral-4", className)} {...props} />
  ),
  code: ({ node: _node, className, ...props }) => (
    <code
      className={cn(
        "rounded-xs bg-neutral-3 px-xxs font-data text-s text-neutral-10 wrap-anywhere",
        // Inside a block, the <pre> owns the surface.
        "in-[pre]:rounded-zero in-[pre]:bg-transparent in-[pre]:p-zero in-[pre]:wrap-normal",
        // Tables scroll sideways, so their code stays on one line.
        "in-[table]:whitespace-nowrap in-[table]:wrap-normal",
        className,
      )}
      {...props}
    />
  ),
  pre: ({ node: _node, className, ...props }) => (
    <pre
      className={cn(
        "overflow-x-auto rounded-s bg-neutral-2 p-m font-data text-s text-neutral-10 edge-outer",
        className,
      )}
      {...props}
    />
  ),
  table: ({ node: _node, className, ...props }) => (
    <div className="overflow-x-auto rounded-s edge-outer">
      <table className={cn("w-full border-collapse font-ui text-s", className)} {...props} />
    </div>
  ),
  th: ({ node: _node, className, ...props }) => (
    <th
      className={cn("bg-neutral-2 px-s py-xs text-start font-medium text-neutral-7", className)}
      {...props}
    />
  ),
  td: ({ node: _node, className, ...props }) => (
    <td className={cn("px-s py-xs align-top edge-top edge-neutral-4", className)} {...props} />
  ),
  strong: ({ node: _node, className, ...props }) => (
    <strong className={cn("font-medium text-neutral-10", className)} {...props} />
  ),
};

export function Markdown({
  children,
  className,
  components,
  ...props
}: {
  children: string;
  /** Replaces the default element for some tags, for example `a` for app links. */
  components?: Components;
} & Omit<React.ComponentProps<"div">, "children">) {
  return (
    <div
      data-slot="markdown"
      className={cn(
        "min-w-0 space-y-s font-ui text-m text-neutral-10",
        "[&>h2]:mt-xl [&>h3]:mt-l [&>h4]:mt-m [&>:first-child]:mt-0",
        className,
      )}
      {...props}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        skipHtml
        components={components ? { ...defaultComponents, ...components } : defaultComponents}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
