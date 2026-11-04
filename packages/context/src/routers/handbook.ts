import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import { z } from "zod";

import type { InventoryError, Refused, StaleWrite } from "../files.ts";
import {
  getHandbook,
  getHandbookPage,
  HandbookSlug,
  updateHandbookPage,
  type HandbookPageNotFound,
} from "../handbook/pages.ts";
import {
  previewPublish,
  publishHandbook,
  type HandbookPublishChanged,
} from "../handbook/publish.ts";
import type { HandbookCommandFailed, HandbookNotPublishable } from "../handbook/repo.ts";
import { o } from "../procedure.ts";

type HandbookFailure =
  | HandbookNotPublishable
  | HandbookPageNotFound
  | HandbookPublishChanged
  | HandbookCommandFailed
  | StaleWrite
  | Refused
  | InventoryError;

/** What a handbook failure becomes for the caller. */
function toORPCError(error: HandbookFailure) {
  switch (error._tag) {
    case "HandbookNotPublishable":
      return new ORPCError("PRECONDITION_FAILED", {
        message: "handbook/handbook.json names no repository to publish into (publish).",
      });
    case "HandbookPageNotFound":
      return new ORPCError("NOT_FOUND", { message: `No handbook page ${error.slug}.` });
    case "HandbookPublishChanged":
      return new ORPCError("CONFLICT", {
        message: "The changes are not the ones you reviewed anymore. Compare again.",
      });
    case "StaleWrite":
      return new ORPCError("CONFLICT", {
        message: `${error.path} changed since you opened it. Reload it, then edit again.`,
      });
    case "Refused":
      return new ORPCError(error.reason === "conflict" ? "CONFLICT" : "FORBIDDEN", {
        message: error.message,
      });
    case "HandbookCommandFailed":
      return new ORPCError("BAD_GATEWAY", {
        message: `${error.command} failed:\n${error.output}`.trim(),
      });
    case "InventoryError":
      return new ORPCError("INTERNAL_SERVER_ERROR", {
        message: `Could not read ${error.path}.`,
        cause: error.cause,
      });
  }
}

function run<A>(program: Effect.Effect<A, HandbookFailure>) {
  return Effect.runPromise(program.pipe(Effect.catch((error) => Effect.die(toORPCError(error)))));
}

export const handbookRouter = {
  get: o
    .meta({
      mcp: {
        tool: "handbook_get",
        description:
          "The handbook of the instance (handbook/): its sections and pages, with the pages holding blocks filled from the instance marked.",
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
    })
    .handler(({ context }) => run(getHandbook(context.root))),

  page: o
    .meta({
      mcp: {
        tool: "handbook_page_get",
        description:
          'Read one handbook page by slug ("stack/api"; the home page is "index"), as Markdown, with its path in the instance.',
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
    })
    .input(z.object({ slug: HandbookSlug }))
    .handler(({ context, input }) => run(getHandbookPage(context.root, input.slug))),

  update: o
    .input(
      z.object({ slug: HandbookSlug, markdown: z.string().max(200_000), baseHash: z.string() }),
    )
    .handler(({ context, input }) =>
      run(updateHandbookPage(context.root, input.slug, input.markdown, input.baseHash)),
    ),

  publishPreview: o
    .meta({
      mcp: {
        tool: "handbook_publish_preview",
        description:
          "What publishing the handbook would change in the repository handbook.json names: exports the pages on top of origin/main in the app's clone, runs the site's build, and returns the diff, its hash for handbook_publish, and the open publish pull requests. Changes nothing.",
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
    })
    .handler(({ context }) => run(previewPublish(context.root))),

  publish: o
    .meta({
      mcp: {
        tool: "handbook_publish",
        description:
          "Publish the handbook: commits the export on a new handbook/publish-* branch, pushes it, and opens a pull request against main. Pass the diffHash from handbook_publish_preview; a different diff is refused. Never pushes to main: the owner merges.",
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      },
    })
    .input(z.object({ diffHash: z.string().min(1) }))
    .handler(({ context, input }) => run(publishHandbook(context.root, input.diffHash))),
};
