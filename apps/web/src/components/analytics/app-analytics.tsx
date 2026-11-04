import type { AppDetail, Change } from "@opai/context/analytics/overview";
import type { Period } from "@opai/context/analytics/period";
import { Badge } from "@opai/ui/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@opai/ui/components/ui/breadcrumb";
import {
  PageHeader,
  PageMeta,
  PageSection,
  PageSectionTitle,
  PageTitle,
} from "@opai/ui/components/ui/page-header";
import { Skeleton } from "@opai/ui/components/ui/skeleton";
import { ExternalLinkIcon } from "@opai/ui/icon";
import { Link } from "@tanstack/react-router";

import { m } from "@/paraglide/messages.js";

import { formatDuration, formatNumber, formatShare } from "./format";
import { MetricPanel } from "./metric-panel";
import { PeriodPicker } from "./period-picker";
import { periodSearch, usePeriodTarget } from "./search";
import { Trend } from "./trend";
import { VisitsChart } from "./visits-chart";

export function AppAnalytics({
  detail,
  period,
  onPeriodChange,
}: {
  detail: AppDetail;
  period: Period;
  onPeriodChange: (period: Period) => void;
}) {
  const { app, umami } = detail;
  const { current, change } = umami;
  const { pending, dim } = usePeriodTarget();

  return (
    <article className="flex flex-col gap-xl">
      <div className="flex flex-col gap-m">
        <Breadcrumb aria-label={m.breadcrumb()}>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/analytics" search={periodSearch(period)} />}>
                {m.nav_analytics()}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{app.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <PageHeader>
          <PageTitle>{app.name}</PageTitle>
          <PageMeta>
            {app.domain ? (
              <a
                href={`https://${app.domain}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-xxs rounded-xs font-data text-neutral-8 transition-colors hover:text-neutral-10 focus-visible:focus-ring"
              >
                {app.domain}
                <ExternalLinkIcon aria-hidden />
              </a>
            ) : null}
            <Badge variant="neutral">{app.project}</Badge>
            <span>{m.analytics_active_now({ count: detail.activeNow })}</span>
          </PageMeta>
        </PageHeader>
      </div>

      <PageSection aria-labelledby="analytics-summary">
        <div className="flex flex-wrap items-center justify-between gap-s">
          <PageSectionTitle id="analytics-summary">{m.analytics_summary()}</PageSectionTitle>
          <PeriodPicker onChange={onPeriodChange} />
        </div>
        <dl
          aria-busy={pending}
          className={`${dim} grid grid-cols-2 gap-px overflow-hidden rounded-m bg-neutral-4 edge-outer sm:grid-cols-3 lg:grid-cols-5`}
        >
          <Stat
            label={m.analytics_visitors()}
            value={formatNumber(current.visitors)}
            change={change.visitors}
          />
          <Stat
            label={m.analytics_pageviews()}
            value={formatNumber(current.pageviews)}
            change={change.pageviews}
          />
          <Stat
            label={m.analytics_visits()}
            value={formatNumber(current.visits)}
            change={change.visits}
          />
          <Stat label={m.analytics_bounce_rate()} value={formatShare(current.bounceRate)} />
          <Stat
            label={m.analytics_visit_duration()}
            value={formatDuration(current.avgVisitSeconds)}
          />
        </dl>
        <p className="flex flex-wrap items-center gap-x-m gap-y-xs font-ui text-s text-neutral-7">
          <span>{m.analytics_visitor_trend()}</span>
          <TrendLine label={m.analytics_trend_7d()} value={umami.trend["7d"]} />
          <TrendLine label={m.analytics_trend_30d()} value={umami.trend["30d"]} />
        </p>
        {detail.hosts.kept.length > 0 ? (
          <p className="font-ui text-s text-neutral-7">
            {detail.hosts.otherPageviews > 0
              ? m.analytics_hosts_left_out({
                  count: detail.hosts.otherPageviews,
                  hosts: detail.hosts.others.slice(0, 3).join(", "),
                })
              : m.analytics_hosts_only({ host: detail.hosts.kept[0] ?? "" })}
          </p>
        ) : null}
      </PageSection>

      <PageSection aria-labelledby="analytics-chart" aria-busy={pending} className={dim}>
        <PageSectionTitle id="analytics-chart">
          {detail.unit === "hour" ? m.analytics_visits_per_hour() : m.analytics_visits_per_day()}
        </PageSectionTitle>
        <VisitsChart series={detail.series} unit={detail.unit} />
      </PageSection>

      <div
        aria-busy={pending}
        className={`${dim} grid grid-cols-[minmax(0,1fr)] gap-xl lg:grid-cols-2`}
      >
        <MetricPanel
          id="analytics-pages"
          appId={app.id}
          period={period}
          title={m.analytics_pages()}
          tabs={[
            { dimension: "path", label: m.analytics_tab_path() },
            { dimension: "entry", label: m.analytics_tab_entry() },
            { dimension: "exit", label: m.analytics_tab_exit() },
            { dimension: "title", label: m.analytics_tab_title() },
          ]}
        />
        <MetricPanel
          id="analytics-sources"
          appId={app.id}
          period={period}
          title={m.analytics_sources()}
          tabs={[
            { dimension: "referrer", label: m.analytics_tab_referrer() },
            { dimension: "channel", label: m.analytics_tab_channel() },
            { dimension: "query", label: m.analytics_tab_query() },
          ]}
        />
        <MetricPanel
          id="analytics-environment"
          appId={app.id}
          period={period}
          title={m.analytics_environment()}
          tabs={[
            { dimension: "browser", label: m.analytics_tab_browser() },
            { dimension: "os", label: m.analytics_tab_os() },
            { dimension: "device", label: m.analytics_tab_device() },
            { dimension: "screen", label: m.analytics_tab_screen() },
          ]}
        />
        <MetricPanel
          id="analytics-location"
          appId={app.id}
          period={period}
          title={m.analytics_location()}
          tabs={[
            { dimension: "country", label: m.analytics_tab_country() },
            { dimension: "language", label: m.analytics_tab_language() },
          ]}
        />
        <MetricPanel
          id="analytics-events"
          appId={app.id}
          period={period}
          title={m.analytics_tab_events()}
          tabs={[{ dimension: "event", label: m.analytics_tab_events() }]}
        />
      </div>
    </article>
  );
}

function Stat({ label, value, change }: { label: string; value: string; change?: Change }) {
  return (
    <div className="flex flex-col gap-xxs bg-neutral-1 px-m py-s dark:bg-neutral-2">
      <dt className="font-ui text-s text-neutral-7">{label}</dt>
      <dd className="flex flex-wrap items-center gap-xs">
        <span className="font-data text-l text-neutral-10 tabular-nums">{value}</span>
        {change !== undefined ? <Trend value={change} /> : null}
      </dd>
    </div>
  );
}

function TrendLine({ label, value }: { label: string; value: Change }) {
  return (
    <span className="inline-flex items-center gap-xs">
      {label}
      <Trend value={value} />
    </span>
  );
}

export function AppAnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true">
      <div className="flex flex-col gap-xs">
        <Skeleton className="h-(--line-s) w-40" />
        <Skeleton className="h-(--line-l) w-48" />
      </div>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
