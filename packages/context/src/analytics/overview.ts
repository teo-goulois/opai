import { Data, Effect } from "effect";

import { loadCatalog, type CatalogApp, type UmamiInstance } from "./catalog.ts";
import type { Dimension } from "./dimension.ts";
import { periodRange, type Period, type Range } from "./period.ts";
import {
  getActive,
  getMetrics,
  getSeries,
  getStats,
  listWebsites,
  umamiConnection,
  umamiEnv,
  UmamiNotConfigured,
  type Filter,
  type UmamiConnection,
  type UmamiCounts,
  type UmamiEnv,
  type UmamiRequestFailed,
} from "./umami.ts";

// Turns raw Umami numbers into what the Analytics page compares: totals for
// the chosen period, the change from the period before, and the 7- and 30-day
// trends. One app failing never hides the others: its row carries the reason.
//
// Umami already drops known bots when a hit arrives. Every number here also
// keeps only the app's own hosts (its domain and www.), which leaves out
// copies of the script on other sites, preview deployments, and localhost.

export class AppNotFound extends Data.TaggedError("AppNotFound")<{ id: string }> {}
export class AppNotTracked extends Data.TaggedError("AppNotTracked")<{ id: string }> {}

export type Totals = {
  visitors: number;
  pageviews: number;
  visits: number;
  /** Share of visits that saw one page, from 0 to 1. Null without visits. */
  bounceRate: number | null;
  /** Mean visit length in seconds. Null without visits. */
  avgVisitSeconds: number | null;
};

/** Relative change from the previous window: 0.25 is +25%. Null when the previous window is 0 and this one is not. */
export type Change = number | null;

export type UmamiSummary =
  | {
      status: "ok";
      instance: UmamiInstance;
      current: Totals;
      previous: Totals;
      change: { visitors: Change; pageviews: Change; visits: Change };
      /** Visitors over the last 7 and 30 days against the 7 and 30 days before. */
      trend: { "7d": Change; "30d": Change };
    }
  | { status: "not-tracked" }
  | { status: "missing-id"; instance: UmamiInstance }
  | { status: "missing-access"; instance: UmamiInstance; variable: string; infisical?: string }
  | { status: "error"; instance: UmamiInstance; message: string };

export type AppRow = {
  app: Pick<CatalogApp, "id" | "name" | "project" | "kind" | "domain" | "repo"> & {
    hasPosthog: boolean;
  };
  umami: UmamiSummary;
};

export type AnalyticsOverview = {
  period: Period;
  range: Range;
  generatedAt: string;
  apps: AppRow[];
};

export type AppDetail = AppRow & {
  umami: Extract<UmamiSummary, { status: "ok" }>;
  activeNow: number;
  /** One point per hour (24h) or day, empty buckets included. `at` is wall time in the server's time zone, written as UTC. */
  series: { at: string; pageviews: number; visits: number }[];
  unit: Range["unit"];
  /** Hosts kept in every number, and what other hosts sent over the period. */
  hosts: { kept: string[]; otherPageviews: number; others: string[] };
};

export type AppMetric = {
  dimension: Dimension;
  /** Visitors per value; for `event`, the number of events. `value` is null for direct visits or an unknown value. */
  rows: { value: string | null; count: number }[];
};

export function totals(counts: UmamiCounts): Totals {
  return {
    visitors: counts.visitors,
    pageviews: counts.pageviews,
    visits: counts.visits,
    bounceRate: counts.visits > 0 ? Math.min(counts.bounces, counts.visits) / counts.visits : null,
    avgVisitSeconds: counts.visits > 0 ? counts.totaltime / counts.visits : null,
  };
}

export function change(current: number, previous: number): Change {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

function describe(app: CatalogApp): AppRow["app"] {
  const { id, name, project, kind, domain, repo } = app;
  return { id, name, project, kind, domain, repo, hasPosthog: app.sources.posthog === true };
}

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Every bucket key of a range, in Umami's format: wall time in `timeZone`
 * written as UTC ("2026-10-24T14:00:00Z"). Umami leaves out empty buckets.
 */
export function bucketKeys(range: Range, timeZone: string): string[] {
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const keys = new Set<string>();
  for (let t = range.startAt; t <= range.endAt; t += 3_600_000) {
    const p = Object.fromEntries(format.formatToParts(t).map((part) => [part.type, part.value]));
    const hour = range.unit === "hour" ? p.hour : "00";
    keys.add(`${p.year}-${p.month}-${p.day}T${hour}:00:00Z`);
  }
  return [...keys];
}

type Tracked = { connection: UmamiConnection; websiteId: string; filter: Filter };

/** The hosts an app's numbers keep: its domain, with and without www. */
export function ownHosts(domain: string | null): string[] {
  if (!domain) return [];
  const bare = domain.replace(/^www\./, "");
  return [bare, `www.${bare}`];
}

/** The connection and website id of an app. Without an id in the catalog, looks the domain up in Umami. */
function tracked(
  app: CatalogApp,
  umamiUrl: string | undefined,
  { env, infisical }: UmamiEnv,
): Effect.Effect<Tracked, UmamiNotConfigured | UmamiRequestFailed | AppNotTracked> {
  const umami = app.sources.umami;
  if (!umami) return Effect.fail(new AppNotTracked({ id: app.id }));
  return Effect.gen(function* () {
    const connection = yield* umamiConnection(umami.instance, {
      ...env,
      UMAMI_URL: env.UMAMI_URL || umamiUrl,
    }).pipe(
      Effect.mapError((e) =>
        infisical
          ? new UmamiNotConfigured({ instance: e.instance, variable: e.variable, infisical })
          : e,
      ),
    );
    const hosts = ownHosts(app.domain);
    const filter: Filter = hosts.length > 0 ? { hostname: hosts.join(",") } : {};
    if (umami.websiteId) return { connection, websiteId: umami.websiteId, filter };
    const websites = yield* listWebsites(connection);
    const match = websites.find((w) => app.domain !== null && w.domain === app.domain);
    if (!match) return yield* Effect.fail(new AppNotTracked({ id: app.id }));
    return { connection, websiteId: match.id, filter };
  });
}

function summarize(
  { connection, websiteId, filter }: Tracked,
  period: Period,
  now: number,
): Effect.Effect<Extract<UmamiSummary, { status: "ok" }>, UmamiRequestFailed> {
  return Effect.gen(function* () {
    const [selected, week, month] = yield* Effect.all(
      [
        getStats(connection, websiteId, periodRange(period, now), filter),
        getStats(connection, websiteId, periodRange("7d", now), filter),
        getStats(connection, websiteId, periodRange("30d", now), filter),
      ] as const,
      { concurrency: 3 },
    );
    return {
      status: "ok" as const,
      instance: connection.instance,
      current: totals(selected),
      previous: totals(selected.comparison),
      change: {
        visitors: change(selected.visitors, selected.comparison.visitors),
        pageviews: change(selected.pageviews, selected.comparison.pageviews),
        visits: change(selected.visits, selected.comparison.visits),
      },
      trend: {
        "7d": change(week.visitors, week.comparison.visitors),
        "30d": change(month.visitors, month.comparison.visitors),
      },
    };
  });
}

/** One row per app of the catalog, for the comparison table. Never fails. */
export function getOverview(root: string, period: Period): Effect.Effect<AnalyticsOverview> {
  const now = Date.now();
  const catalog = loadCatalog(root);
  const env = umamiEnv(root);
  return Effect.forEach(
    catalog.apps,
    (app) =>
      tracked(app, catalog.umamiUrl, env).pipe(
        Effect.flatMap((t) => summarize(t, period, now)),
        Effect.catchTags({
          AppNotTracked: () =>
            Effect.succeed<UmamiSummary>(
              app.sources.umami
                ? { status: "missing-id", instance: app.sources.umami.instance }
                : { status: "not-tracked" },
            ),
          UmamiNotConfigured: (e) =>
            Effect.succeed<UmamiSummary>({
              status: "missing-access",
              instance: e.instance,
              variable: e.variable,
              ...(e.infisical ? { infisical: e.infisical } : {}),
            }),
          UmamiRequestFailed: (e) =>
            Effect.succeed<UmamiSummary>({
              status: "error",
              instance: e.instance,
              message: e.status
                ? `Umami answered ${e.status} on ${e.path}`
                : `Umami unreachable on ${e.path}: ${e.cause instanceof Error ? e.cause.message : "unknown error"}`,
            }),
        }),
        Effect.map((umami): AppRow => ({ app: describe(app), umami })),
      ),
    // All apps at once: with the hostname filter, Umami takes 1 to 3 s per
    // answer, and batches of 4 made a new period wait four rounds of it.
    { concurrency: "unbounded" },
  ).pipe(
    Effect.map((apps) => ({
      period,
      range: periodRange(period, now),
      generatedAt: new Date(now).toISOString(),
      apps,
    })),
  );
}

function trackedApp(root: string, id: string) {
  const catalog = loadCatalog(root);
  const app = catalog.apps.find((candidate) => candidate.id === id);
  return app
    ? tracked(app, catalog.umamiUrl, umamiEnv(root)).pipe(Effect.map((t) => ({ app, ...t })))
    : Effect.fail(new AppNotFound({ id }));
}

/** Everything the page of one app shows, except the breakdowns (see `getAppMetric`). */
export function getAppDetail(
  root: string,
  id: string,
  period: Period,
): Effect.Effect<AppDetail, AppNotFound | AppNotTracked | UmamiNotConfigured | UmamiRequestFailed> {
  return Effect.gen(function* () {
    const { app, connection, websiteId, filter } = yield* trackedApp(root, id);
    const now = Date.now();
    const summary = yield* summarize({ connection, websiteId, filter }, period, now);
    const range = periodRange(period, now);
    const zone = timezone();

    const [activeNow, series, unfiltered, hostnames] = yield* Effect.all(
      [
        getActive(connection, websiteId),
        getSeries(connection, websiteId, range, zone, filter),
        getStats(connection, websiteId, range, {}),
        getMetrics(connection, websiteId, range, "hostname", {}, 20),
      ] as const,
      { concurrency: 4 },
    );

    const kept = ownHosts(app.domain);
    const pageviewsAt = new Map(series.pageviews.map((p) => [p.x, p.y]));
    const visitorsAt = new Map(series.sessions.map((p) => [p.x, p.y]));
    return {
      app: describe(app),
      umami: summary,
      activeNow,
      unit: range.unit,
      series: bucketKeys(range, zone).map((at) => ({
        at,
        pageviews: pageviewsAt.get(at) ?? 0,
        visits: visitorsAt.get(at) ?? 0,
      })),
      hosts: {
        kept,
        otherPageviews:
          kept.length > 0 ? Math.max(0, unfiltered.pageviews - summary.current.pageviews) : 0,
        others: hostnames
          .map((h) => h.x)
          .filter((h): h is string => h !== null && kept.length > 0 && !kept.includes(h)),
      },
    };
  });
}

/** The top values of one breakdown of an app, own hosts only. */
export function getAppMetric(
  root: string,
  id: string,
  period: Period,
  dimension: Dimension,
): Effect.Effect<AppMetric, AppNotFound | AppNotTracked | UmamiNotConfigured | UmamiRequestFailed> {
  return Effect.gen(function* () {
    const { connection, websiteId, filter } = yield* trackedApp(root, id);
    const range = periodRange(period, Date.now());
    const rows = yield* getMetrics(connection, websiteId, range, dimension, filter, 50);
    return { dimension, rows: rows.map((m) => ({ value: m.x === "" ? null : m.x, count: m.y })) };
  });
}
