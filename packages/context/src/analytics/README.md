# Analytics

Server-side data for the Analytics page: it compares the sites and apps
listed in `analytics.json` at the root of the instance. Read-only. The browser never calls Umami; it
calls the oRPC procedures below.

| File           | Role                                                           |
| -------------- | -------------------------------------------------------------- |
| `catalog.ts`   | Reads `analytics.json`: each app, its project, its Umami id    |
| `period.ts`    | Periods (`24h`, `7d`, `30d`, `90d`) and their time ranges      |
| `dimension.ts` | The breakdowns of one app: pages, sources, browsers, countries |
| `umami.ts`     | Umami API client: stats, time series, top values, visitors now |
| `overview.ts`  | Totals, change from the previous period, 7- and 30-day trends  |

Procedures, in `routers/analytics.ts`, also offered to agents over MCP:

- `analytics.overview({ period })`: one row per app. A row without data says
  why: `not-tracked`, `missing-id`, `missing-access` (with the variable, and
  why Infisical could not be read when it was tried), or
  `error`.
- `analytics.app({ id, period })`: one app, with page views and visits per
  hour or day, visitors now, and the page views other hosts sent.
- `analytics.metric({ id, period, dimension })`: the top 50 values of one
  breakdown, such as `path`, `referrer`, `browser`, `country`, or `event`.

## What is counted

Umami drops known bots when a hit arrives (its bot check is on: the instance
does not set `DISABLE_BOT_CHECK`). Every number here also keeps only the
app's own hosts, its domain with and without `www.`, through Umami's
`hostname` filter. That leaves out copies of the script on other sites,
preview deployments, and localhost. A bot that passes for a browser still
counts: Umami cannot tell it apart.

## Access

The keys come from the environment of the server; those it lacks, the server
reads once from the root folder of the instance's Infisical project
(`.infisical.yaml`), however it was started (`opai app`, Localify, `pnpm
dev`). A server without them shows each app as "Missing access", with the
variable it needs.

- `UMAMI_ADMIN_API_KEY`: your own Umami, at the `umamiUrl` of
  `analytics.json` (`UMAMI_URL` overrides it).
- `UMAMI_CLOUD_API_KEY`: Umami Cloud. A site without a website id is found by
  its domain.

## Adding a source

Revenue (Stripe, Polar, RevenueCat), status, and errors come later. Each gets
an entry under `sources` in `analytics.json` and `catalog.ts`, its own client file here, and its
own field in `AppRow`, so one source failing leaves the others readable.
