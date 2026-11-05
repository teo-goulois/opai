import type { Dimension } from "@opai/context/analytics/dimension";
import type { AppMetric } from "@opai/context/analytics/overview";
import type { Period } from "@opai/context/analytics/period";
import { Button } from "@opai/ui/components/ui/button";
import { PageSection, PageSectionTitle } from "@opai/ui/components/ui/page-header";
import { Skeleton } from "@opai/ui/components/ui/skeleton";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@opai/ui/components/ui/tabs";
import { cn } from "@opai/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

import { formatNumber, formatShare } from "./format";
import { flag, metricLabel } from "./labels";

// One card of breakdowns, like Umami's: a tab per dimension, then the top
// values with their count and their share of the list, drawn as a bar behind
// the row. Each tab loads when it is first opened.

export type MetricTab = { dimension: Dimension; label: string };

const SHOWN = 10;

/** The tab each panel of the app page opens on, to load with the page. */
export const FIRST_TABS = [
  "path",
  "referrer",
  "browser",
  "country",
  "event",
] as const satisfies Dimension[];

export const metricQuery = (id: string, period: Period, dimension: Dimension) =>
  orpc.analytics.metric.queryOptions({ input: { id, period, dimension } });

export function MetricPanel({
  id,
  appId,
  period,
  title,
  tabs,
}: {
  id: string;
  appId: string;
  period: Period;
  title: string;
  tabs: MetricTab[];
}) {
  const first = tabs[0]?.dimension;
  return (
    <PageSection aria-labelledby={id}>
      <PageSectionTitle id={id}>{title}</PageSectionTitle>
      {tabs.length > 1 ? (
        <Tabs defaultValue={first}>
          <TabsList>
            {tabs.map((tab) => (
              <TabsTab key={tab.dimension} value={tab.dimension}>
                {tab.label}
              </TabsTab>
            ))}
          </TabsList>
          {tabs.map((tab) => (
            <TabsPanel key={tab.dimension} value={tab.dimension}>
              <MetricList appId={appId} period={period} dimension={tab.dimension} />
            </TabsPanel>
          ))}
        </Tabs>
      ) : first ? (
        <MetricList appId={appId} period={period} dimension={first} />
      ) : null}
    </PageSection>
  );
}

function MetricList({
  appId,
  period,
  dimension,
}: {
  appId: string;
  period: Period;
  dimension: Dimension;
}) {
  const query = useQuery(metricQuery(appId, period, dimension));
  if (query.isPending) return <MetricListSkeleton />;
  if (query.isError) {
    return <p className="font-ui text-s text-error">{query.error.message}</p>;
  }
  return <MetricRows metric={query.data} />;
}

function MetricRows({ metric }: { metric: AppMetric }) {
  const [all, setAll] = useState(false);
  const { rows, dimension } = metric;
  if (rows.length === 0) {
    return <p className="font-ui text-s text-neutral-7">{m.analytics_no_data()}</p>;
  }
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const shown = all ? rows : rows.slice(0, SHOWN);

  return (
    <div className="flex flex-col gap-xs">
      <div className="flex justify-between px-s font-ui text-xs text-neutral-7">
        <span>{m.analytics_value()}</span>
        <span>{dimension === "event" ? m.analytics_tab_events() : m.analytics_visitors()}</span>
      </div>
      <ul className="flex flex-col gap-xxs">
        {shown.map((row) => {
          const share = total > 0 ? row.count / total : 0;
          const label = metricLabel(dimension, row.value);
          return (
            <li
              key={row.value ?? ""}
              className="relative flex items-center gap-s overflow-hidden rounded-xs px-s py-xxs font-ui text-s"
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 bg-color-1-transparent"
                style={{ width: `${share * 100}%` }}
              />
              <span
                className={cn(
                  "relative min-w-0 flex-1 truncate text-neutral-10",
                  row.value === null && "text-neutral-7",
                  isCode(dimension) && "font-data",
                )}
                title={row.value ?? undefined}
              >
                {dimension === "country" && row.value ? `${flag(row.value)} ` : null}
                {label}
              </span>
              <span className="relative font-ui text-neutral-10 tabular-nums">
                {formatNumber(row.count)}
              </span>
              <span className="relative w-10 text-right font-ui text-neutral-7 tabular-nums">
                {formatShare(share)}
              </span>
            </li>
          );
        })}
      </ul>
      {rows.length > SHOWN ? (
        <Button variant="ghost" className="self-start" onClick={() => setAll(!all)}>
          {all ? m.analytics_show_less() : m.analytics_show_all({ count: rows.length })}
        </Button>
      ) : null}
    </div>
  );
}

const isCode = (dimension: Dimension) =>
  dimension === "path" ||
  dimension === "entry" ||
  dimension === "exit" ||
  dimension === "query" ||
  dimension === "screen" ||
  dimension === "referrer";

function MetricListSkeleton() {
  return (
    <div className="flex flex-col gap-xs" aria-busy="true">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-(--line-m) w-full" />
      ))}
    </div>
  );
}
