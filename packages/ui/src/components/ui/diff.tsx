"use client";

import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@opai/ui/components/ui/collapsible";
import { cn } from "@opai/ui/lib/utils";
import type * as React from "react";

// A unified diff (`git diff`), one collapsible block per file. Added lines on
// the success surface, removed lines on the error one, each with its sign so
// the change never depends on color alone.
// No Graphical specification: built from the Collapsible and code block roles.

export type DiffFile = {
  path: string;
  additions: number;
  deletions: number;
  lines: DiffLine[];
};

export type DiffLine = { kind: "add" | "remove" | "context" | "hunk"; text: string };

/** Splits `git diff` output into files and lines. */
export function parseDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | undefined;
  let inHeader = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const path = / b\/(.+)$/.exec(line)?.[1] ?? line;
      file = { path, additions: 0, deletions: 0, lines: [] };
      files.push(file);
      inHeader = true;
      continue;
    }
    if (!file) continue;
    if (line.startsWith("@@")) {
      inHeader = false;
      file.lines.push({ kind: "hunk", text: line });
    } else if (inHeader) {
      continue;
    } else if (line.startsWith("+")) {
      file.additions += 1;
      file.lines.push({ kind: "add", text: line.slice(1) });
    } else if (line.startsWith("-")) {
      file.deletions += 1;
      file.lines.push({ kind: "remove", text: line.slice(1) });
    } else if (line.startsWith(" ")) {
      file.lines.push({ kind: "context", text: line.slice(1) });
    }
  }
  return files;
}

const signs = { add: "+", remove: "−", context: " ", hunk: "" } as const;

export function DiffView({
  diff,
  defaultOpen = () => true,
  className,
  ...props
}: {
  diff: string;
  /** Whether a file starts open. */
  defaultOpen?: (path: string) => boolean;
} & Omit<React.ComponentProps<"div">, "children">) {
  const files = parseDiff(diff);
  return (
    <div data-slot="diff" className={cn("flex flex-col gap-s", className)} {...props}>
      {files.map((file) => (
        <Collapsible key={file.path} defaultOpen={defaultOpen(file.path)}>
          <CollapsibleTrigger className="gap-s">
            <span className="min-w-0 flex-1 truncate font-data text-s">{file.path}</span>
            <span className="shrink-0 font-data text-s text-neutral-7 tabular-nums">
              +{file.additions} −{file.deletions}
            </span>
          </CollapsibleTrigger>
          <CollapsiblePanel variant="plain">
            <div className="overflow-x-auto rounded-s bg-neutral-1 font-data text-s edge-outer dark:bg-neutral-2">
              <table className="w-full border-collapse">
                <tbody>
                  {file.lines.map((line, index) => (
                    <tr
                      // Lines repeat; their position in the file is their identity.
                      key={index}
                      className={cn(
                        line.kind === "add" && "bg-success-transparent",
                        line.kind === "remove" && "bg-error-transparent",
                        line.kind === "hunk" && "bg-neutral-2 text-neutral-7 dark:bg-neutral-3",
                      )}
                    >
                      <td
                        aria-hidden
                        className="w-l px-xs text-center align-top text-neutral-7 select-none"
                      >
                        {signs[line.kind]}
                      </td>
                      <td className="px-xs whitespace-pre text-neutral-10">
                        {line.kind === "add" ? <span className="sr-only">+</span> : null}
                        {line.kind === "remove" ? <span className="sr-only">−</span> : null}
                        {line.text || " "}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsiblePanel>
        </Collapsible>
      ))}
    </div>
  );
}
