import { ORPCError } from "@orpc/server";
import { Effect } from "effect";
import { z } from "zod";

import { AppId } from "../analytics/catalog.ts";
import { Dimension } from "../analytics/dimension.ts";
import {
  getAppDetail,
  getAppMetric,
  getOverview,
  type AppNotFound,
  type AppNotTracked,
} from "../analytics/overview.ts";
import { Period } from "../analytics/period.ts";
import type { UmamiNotConfigured, UmamiRequestFailed } from "../analytics/umami.ts";
import { o } from "../procedure.ts";

const PeriodInput = Period.default("30d");

// What a failure of one app becomes for the caller.
const appErrors = {
  AppNotFound: (e: AppNotFound) =>
    Effect.die(new ORPCError("NOT_FOUND", { message: `No app named ${e.id}.` })),
  AppNotTracked: (e: AppNotTracked) =>
    Effect.die(new ORPCError("NOT_FOUND", { message: `${e.id} has no Umami website id.` })),
  UmamiNotConfigured: (e: UmamiNotConfigured) =>
    Effect.die(
      new ORPCError("PRECONDITION_FAILED", {
        message: e.infisical
          ? `${e.variable} is not set, and ${e.infisical}`
          : `${e.variable} is not set: add it to the root folder of the instance's Infisical project, or to the server's environment.`,
      }),
    ),
  UmamiRequestFailed: (e: UmamiRequestFailed) =>
    Effect.die(
      new ORPCError("BAD_GATEWAY", {
        message: `Umami (${e.instance}) failed on ${e.path}${e.status ? ` with ${e.status}` : ""}.`,
      }),
    ),
} as const;

export const analyticsRouter = {
  overview: o
    .meta({
      mcp: {
        tool: "analytics_overview",
        description:
          "Compare every site and app listed in the instance's analytics.json over a period: visitors, page views, visits, bounce rate, visit length, change from the previous period, and 7- and 30-day trends, from Umami. Known bots and hits from other hosts are left out. Rows without data say why.",
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
    })
    .input(z.object({ period: PeriodInput }))
    .handler(({ input, context }) => Effect.runPromise(getOverview(context.root, input.period))),

  app: o
    .meta({
      mcp: {
        tool: "analytics_app",
        description:
          "Umami numbers of one site or app over a period: totals, trends, visitors now, page views and visitors per hour or day, and how many page views came from other hosts. For pages, sources, browsers, countries or events, use analytics_metric.",
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
    })
    .input(z.object({ id: AppId, period: PeriodInput }))
    .handler(({ input, context }) =>
      Effect.runPromise(
        getAppDetail(context.root, input.id, input.period).pipe(Effect.catchTags(appErrors)),
      ),
    ),

  metric: o
    .meta({
      mcp: {
        tool: "analytics_metric",
        description:
          "Top values of one breakdown of a site or app over a period, from Umami: pages (path, entry, exit, title), sources (referrer, channel, query), environment (browser, os, device, screen), location (country, language), or custom events. Counts are visitors, or event counts for event.",
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
    })
    .input(z.object({ id: AppId, period: PeriodInput, dimension: Dimension }))
    .handler(({ input, context }) =>
      Effect.runPromise(
        getAppMetric(context.root, input.id, input.period, input.dimension).pipe(
          Effect.catchTags(appErrors),
        ),
      ),
    ),
};
