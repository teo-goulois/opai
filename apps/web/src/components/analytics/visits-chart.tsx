import type { AppDetail } from "@opai/context/analytics/overview";
import { cn } from "@opai/ui/lib/utils";
import { useState } from "react";

import { m } from "@/paraglide/messages.js";

import { formatBucket, formatNumber } from "./format";

// Like Umami: page views as a light column, visits in the accent in front of
// it, both anchored to the baseline, a 2px gap between columns. Hovering a
// column shows its exact values in the line above; at rest that line names
// the peak of visits.

export function VisitsChart({ series, unit }: Pick<AppDetail, "series" | "unit">) {
  const [active, setActive] = useState<number | null>(null);
  const total = series.reduce((sum, point) => sum + point.visits, 0);
  const peak = series.reduce(
    (best, point, index) => (point.visits > (series[best]?.visits ?? 0) ? index : best),
    0,
  );
  const max = Math.max(1, ...series.map((point) => point.pageviews), series[peak]?.visits ?? 0);
  const shown = active !== null ? series[active] : undefined;
  const first = series[0];
  const last = series.at(-1);

  return (
    <figure className="flex flex-col gap-xs">
      <div className="flex gap-m font-ui text-xs text-neutral-7">
        <span className="inline-flex items-center gap-xxs">
          <span aria-hidden className="size-2 rounded-full bg-color-1" />
          {m.analytics_visits()}
        </span>
        <span className="inline-flex items-center gap-xxs">
          <span aria-hidden className="size-2 rounded-full bg-color-1-transparent" />
          {m.analytics_pageviews()}
        </span>
      </div>
      <p className="min-h-(--line-s) font-ui text-s text-neutral-7" aria-live="polite">
        {shown ? (
          <>
            <span className="text-neutral-10">{formatBucket(shown.at, unit)}</span>
            {" · "}
            {m.analytics_chart_point({
              visits: formatNumber(shown.visits),
              pageviews: formatNumber(shown.pageviews),
            })}
          </>
        ) : total > 0 && series[peak] ? (
          m.analytics_chart_peak({
            value: formatNumber(series[peak].visits),
            at: formatBucket(series[peak].at, unit),
          })
        ) : (
          m.analytics_chart_empty()
        )}
      </p>

      <div
        role="img"
        aria-label={m.analytics_chart_label({ total: formatNumber(total) })}
        className="flex h-40 items-end gap-[2px] edge-bottom edge-neutral-5"
        onMouseLeave={() => setActive(null)}
      >
        {series.map((point, index) => (
          <div
            key={point.at}
            className={cn(
              "relative h-full min-w-0 flex-1 transition-opacity",
              active !== null && active !== index && "opacity-40",
            )}
            onMouseEnter={() => setActive(index)}
          >
            <div
              className="absolute inset-x-0 bottom-0 rounded-t-xs bg-color-1-transparent"
              style={{ height: `${(point.pageviews / max) * 100}%` }}
            />
            <div
              className="absolute inset-x-0 bottom-0 rounded-t-xs bg-color-1"
              style={{ height: `${(point.visits / max) * 100}%` }}
            />
          </div>
        ))}
      </div>

      {first && last ? (
        <figcaption className="flex justify-between font-ui text-xs text-neutral-7 tabular-nums">
          <span>{formatBucket(first.at, unit)}</span>
          <span>{formatBucket(last.at, unit)}</span>
        </figcaption>
      ) : null}
    </figure>
  );
}
