import type { AnalyticsOverview, AppRow, UmamiSummary } from "@opai/context/analytics/overview";
import type { Period } from "@opai/context/analytics/period";
import { Badge } from "@opai/ui/components/ui/badge";
import {
  PageHeader,
  PageMeta,
  PageSection,
  PageSectionTitle,
  PageTitle,
} from "@opai/ui/components/ui/page-header";
import { Skeleton } from "@opai/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@opai/ui/components/ui/table";
import { Link } from "@tanstack/react-router";

import { m } from "@/paraglide/messages.js";

import { formatDuration, formatNumber, formatShare } from "./format";
import { PeriodPicker } from "./period-picker";
import { periodSearch, usePeriodTarget } from "./search";
import { Trend } from "./trend";

type TrackedRow = AppRow & { umami: Extract<UmamiSummary, { status: "ok" }> };

const isTracked = (row: AppRow): row is TrackedRow => row.umami.status === "ok";

export function AnalyticsOverviewPage({
  overview,
  period,
  onPeriodChange,
}: {
  overview: AnalyticsOverview;
  period: Period;
  onPeriodChange: (period: Period) => void;
}) {
  const tracked = overview.apps
    .filter(isTracked)
    .sort((a, b) => b.umami.current.visitors - a.umami.current.visitors);
  const untracked = overview.apps.filter((row) => !isTracked(row));
  const { pending, dim } = usePeriodTarget();

  return (
    <div className="flex flex-col gap-xl">
      <PageHeader>
        <PageTitle>{m.analytics_title()}</PageTitle>
        <PageMeta>{m.analytics_source()}</PageMeta>
      </PageHeader>

      <PageSection aria-labelledby="analytics-tracked">
        <div className="flex flex-wrap items-center justify-between gap-s">
          <PageSectionTitle id="analytics-tracked" count={tracked.length}>
            {m.analytics_tracked()}
          </PageSectionTitle>
          <PeriodPicker onChange={onPeriodChange} />
        </div>
        <div aria-busy={pending} className={dim}>
          <ComparisonTable rows={tracked} period={period} />
        </div>
      </PageSection>

      {untracked.length > 0 ? (
        <PageSection aria-labelledby="analytics-untracked">
          <div className="flex flex-col gap-xxs">
            <PageSectionTitle id="analytics-untracked" count={untracked.length}>
              {m.analytics_untracked()}
            </PageSectionTitle>
            <p className="font-ui text-s text-neutral-7">{m.analytics_untracked_hint()}</p>
          </div>
          <UntrackedTable rows={untracked} />
        </PageSection>
      ) : null}
    </div>
  );
}

function ComparisonTable({ rows, period }: { rows: TrackedRow[]; period: Period }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.analytics_app()}</TableHead>
          <TableHead>{m.analytics_project()}</TableHead>
          <TableHead numeric>{m.analytics_visitors()}</TableHead>
          <TableHead numeric>{m.analytics_pageviews()}</TableHead>
          <TableHead numeric>{m.analytics_visits()}</TableHead>
          <TableHead numeric>{m.analytics_bounce_rate()}</TableHead>
          <TableHead numeric>{m.analytics_visit_duration()}</TableHead>
          <TableHead numeric>{m.analytics_trend_7d()}</TableHead>
          <TableHead numeric>{m.analytics_trend_30d()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ app, umami }) => (
          <TableRow
            key={app.id}
            className="relative cursor-pointer transition-colors hover:bg-neutral-3-transparent"
          >
            <TableCell>
              <AppName app={app} period={period} />
            </TableCell>
            <TableCell>
              <Badge variant="neutral">{app.project}</Badge>
            </TableCell>
            <TableCell numeric>{formatNumber(umami.current.visitors)}</TableCell>
            <TableCell numeric>{formatNumber(umami.current.pageviews)}</TableCell>
            <TableCell numeric>{formatNumber(umami.current.visits)}</TableCell>
            <TableCell numeric>{formatShare(umami.current.bounceRate)}</TableCell>
            <TableCell numeric>{formatDuration(umami.current.avgVisitSeconds)}</TableCell>
            <TableCell numeric>
              <Trend value={umami.trend["7d"]} />
            </TableCell>
            <TableCell numeric>
              <Trend value={umami.trend["30d"]} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AppName({ app, period }: { app: AppRow["app"]; period: Period }) {
  return (
    <div className="flex min-w-40 flex-col">
      <Link
        to="/analytics/$id"
        params={{ id: app.id }}
        // Hovering the row starts loading the app page, so the click lands on data.
        preload="intent"
        search={periodSearch(period)}
        // The link covers the whole row, so a click anywhere opens the app.
        className="w-fit rounded-xs font-medium text-neutral-10 underline decoration-transparent underline-offset-4 transition-colors after:absolute after:inset-0 hover:decoration-neutral-10 focus-visible:focus-ring"
      >
        {app.name}
      </Link>
      {app.domain ? <span className="font-ui text-xs text-neutral-7">{app.domain}</span> : null}
    </div>
  );
}

function reason(umami: UmamiSummary) {
  switch (umami.status) {
    case "not-tracked":
      return m.analytics_reason_not_tracked();
    case "missing-id":
      return m.analytics_reason_missing_id();
    case "missing-access":
      return m.analytics_reason_missing_access({ variable: umami.variable });
    case "error":
      return m.analytics_reason_error({ message: umami.message });
    case "ok":
      return "";
  }
}

function UntrackedTable({ rows }: { rows: AppRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{m.analytics_app()}</TableHead>
          <TableHead>{m.analytics_project()}</TableHead>
          <TableHead>{m.analytics_reason()}</TableHead>
          <TableHead>{m.analytics_other_sources()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ app, umami }) => (
          <TableRow key={app.id}>
            <TableCell>
              <div className="flex min-w-40 flex-col">
                <span className="font-medium">{app.name}</span>
                <span className="font-ui text-xs text-neutral-7">{app.domain ?? app.repo}</span>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="neutral">{app.project}</Badge>
            </TableCell>
            <TableCell className="whitespace-nowrap text-neutral-8">
              {umami.status === "error" || umami.status === "missing-access" ? (
                <Badge variant={umami.status === "error" ? "error" : "warning"}>
                  {reason(umami)}
                </Badge>
              ) : (
                reason(umami)
              )}
            </TableCell>
            <TableCell className="text-neutral-8">{app.hasPosthog ? "PostHog" : "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function AnalyticsOverviewSkeleton() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true">
      <div className="flex flex-col gap-xs">
        <Skeleton className="h-(--line-l) w-32" />
        <Skeleton className="h-(--line-s) w-48" />
      </div>
      <Skeleton className="h-96 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
