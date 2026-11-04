import { Data, Effect, Exit } from "effect";
import { z } from "zod";

import type { UmamiInstance } from "./catalog.ts";
import type { Range } from "./period.ts";

// Read-only client for the Umami API (v3 response shapes). Runs on the server
// only: the key comes from the environment, through `infisical run`.
//
// - self:  your own Umami at UMAMI_URL, key UMAMI_ADMIN_API_KEY
// - cloud: https://api.umami.is/v1, key UMAMI_CLOUD_API_KEY

export class UmamiNotConfigured extends Data.TaggedError("UmamiNotConfigured")<{
  instance: UmamiInstance;
  variable: string;
}> {}

export class UmamiRequestFailed extends Data.TaggedError("UmamiRequestFailed")<{
  instance: UmamiInstance;
  path: string;
  status?: number;
  cause?: unknown;
}> {}

export type UmamiConnection = {
  instance: UmamiInstance;
  baseUrl: string;
  headers: Record<string, string>;
};

type Env = Record<string, string | undefined>;

export function umamiConnection(
  instance: UmamiInstance,
  env: Env = process.env,
): Effect.Effect<UmamiConnection, UmamiNotConfigured> {
  if (instance === "self") {
    if (!env.UMAMI_URL)
      return Effect.fail(new UmamiNotConfigured({ instance, variable: "UMAMI_URL" }));
    const key = env.UMAMI_ADMIN_API_KEY;
    if (!key)
      return Effect.fail(new UmamiNotConfigured({ instance, variable: "UMAMI_ADMIN_API_KEY" }));
    const url = env.UMAMI_URL.replace(/\/$/, "");
    return Effect.succeed({
      instance,
      baseUrl: `${url}/api`,
      headers: { Authorization: `Bearer ${key}` },
    });
  }
  const key = env.UMAMI_CLOUD_API_KEY;
  if (!key)
    return Effect.fail(new UmamiNotConfigured({ instance, variable: "UMAMI_CLOUD_API_KEY" }));
  return Effect.succeed({
    instance,
    baseUrl: "https://api.umami.is/v1",
    headers: { "x-umami-api-key": key },
  });
}

const Counts = z.object({
  pageviews: z.number(),
  visitors: z.number(),
  visits: z.number(),
  bounces: z.number(),
  /** Seconds, summed over visits. */
  totaltime: z.number(),
});
export type UmamiCounts = z.infer<typeof Counts>;

const Stats = Counts.extend({ comparison: Counts });
export type UmamiStats = z.infer<typeof Stats>;

const Point = z.object({ x: z.string(), y: z.number() });
const Series = z.object({ pageviews: z.array(Point), sessions: z.array(Point) });
export type UmamiSeries = z.infer<typeof Series>;

const Metrics = z.array(z.object({ x: z.string().nullable(), y: z.number() }));
export type UmamiMetrics = z.infer<typeof Metrics>;

const Active = z.object({ visitors: z.number() });

const Websites = z.object({
  data: z.array(z.object({ id: z.string(), name: z.string(), domain: z.string().nullable() })),
});

// Umami sits behind Cloudflare: a request costs 0.3 s on an open connection
// and about 1 s on a new one. So answers are kept, shared, and refreshed in
// the background:
// - fresh for a minute: served as is;
// - up to an hour old: served at once, while a newer answer loads;
// - older, or never seen: the caller waits for Umami.
// A request already on its way is shared, never sent twice.
//
// The cache key replaces the window (startAt, endAt) with its length, so the
// same period stays one entry as time moves on.
const FRESH_MS = 60_000;
const KEEP_MS = 3_600_000;

type Entry = {
  at: number;
  exit: Promise<Exit.Exit<unknown, UmamiRequestFailed>>;
  refreshing: boolean;
};
const cache = new Map<string, Entry>();

function cacheKey(path: string, query: Record<string, string | number>) {
  const { startAt, endAt, ...rest } = query;
  const span = typeof startAt === "number" && typeof endAt === "number" ? endAt - startAt : "";
  return JSON.stringify([path, span, Object.entries(rest).sort()]);
}

function load(key: string, run: Effect.Effect<unknown, UmamiRequestFailed>): Entry {
  const entry: Entry = { at: Date.now(), exit: Effect.runPromiseExit(run), refreshing: false };
  // A failure is not kept: the next caller asks Umami again.
  void entry.exit.then((exit) => {
    if (Exit.isFailure(exit) && cache.get(key) === entry) cache.delete(key);
  });
  return entry;
}

function cached<A>(
  key: string,
  run: Effect.Effect<A, UmamiRequestFailed>,
): Effect.Effect<A, UmamiRequestFailed> {
  return Effect.suspend(() => {
    const now = Date.now();
    let entry = cache.get(key);
    if (!entry || now - entry.at > KEEP_MS) {
      entry = load(key, run);
      cache.set(key, entry);
    } else if (now - entry.at > FRESH_MS && !entry.refreshing) {
      const stale = entry;
      stale.refreshing = true;
      const next = load(key, run);
      void next.exit.then((exit) => {
        if (Exit.isSuccess(exit)) cache.set(key, next);
        else stale.refreshing = false;
      });
    }
    const { exit } = entry;
    return Effect.promise(() => exit).pipe(
      Effect.flatMap((result) =>
        Exit.isSuccess(result) ? Effect.succeed(result.value as A) : Effect.failCause(result.cause),
      ),
    );
  });
}

function get<S extends z.ZodType>(
  connection: UmamiConnection,
  path: string,
  query: Record<string, string | number>,
  schema: S,
): Effect.Effect<z.infer<S>, UmamiRequestFailed> {
  const params = new URLSearchParams(
    Object.entries(query).map(([k, v]): [string, string] => [k, String(v)]),
  );
  const url = `${connection.baseUrl}${path}?${params}`;
  const fail = (status?: number, cause?: unknown) =>
    new UmamiRequestFailed({ instance: connection.instance, path, status, cause });

  const request = Effect.tryPromise({
    try: () => fetch(url, { headers: connection.headers, signal: AbortSignal.timeout(30_000) }),
    catch: (cause) => fail(undefined, cause),
  }).pipe(
    Effect.flatMap((response) =>
      response.ok
        ? Effect.tryPromise({
            try: () => response.json(),
            catch: (cause) => fail(response.status, cause),
          })
        : Effect.fail(fail(response.status)),
    ),
    Effect.flatMap((json) => {
      const parsed = schema.safeParse(json);
      return parsed.success
        ? Effect.succeed(parsed.data)
        : Effect.fail(fail(undefined, parsed.error));
    }),
    // A cold start or a dropped connection fails once in a while: try again once.
    Effect.retry({ times: 1, while: (error) => error.status === undefined }),
  );

  return cached(`${connection.instance}:${cacheKey(path, query)}`, request);
}

/**
 * Umami query filters. `hostname` takes a comma list and keeps hits from any
 * of those hosts: it drops copies of the script on other sites, previews, and
 * localhost.
 */
export type Filter = { hostname?: string };

const window = (range: Range, filter: Filter) => ({
  startAt: range.startAt,
  endAt: range.endAt,
  ...(filter.hostname ? { hostname: filter.hostname } : {}),
});

/** Totals for the range, and for the range of the same length just before it. */
export const getStats = (c: UmamiConnection, websiteId: string, range: Range, filter: Filter) =>
  get(c, `/websites/${websiteId}/stats`, { ...window(range, filter), compare: "prev" }, Stats);

/** Page views and visitors per hour or day. */
export const getSeries = (
  c: UmamiConnection,
  websiteId: string,
  range: Range,
  timezone: string,
  filter: Filter,
) =>
  get(
    c,
    `/websites/${websiteId}/pageviews`,
    { ...window(range, filter), unit: range.unit, timezone },
    Series,
  );

/** Top values of one dimension, with their visitors (events: their count). */
export const getMetrics = (
  c: UmamiConnection,
  websiteId: string,
  range: Range,
  type: string,
  filter: Filter,
  limit = 10,
) => get(c, `/websites/${websiteId}/metrics`, { ...window(range, filter), type, limit }, Metrics);

/** Visitors in the last five minutes. */
export const getActive = (c: UmamiConnection, websiteId: string) =>
  get(c, `/websites/${websiteId}/active`, {}, Active).pipe(Effect.map((a) => a.visitors));

/** Websites the key can read, to find a site by its domain. */
export const listWebsites = (c: UmamiConnection) =>
  get(c, "/websites", { pageSize: 200 }, Websites).pipe(Effect.map((w) => w.data));
