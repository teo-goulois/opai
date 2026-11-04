import type { Change } from "@opai/context/analytics/overview";
import { Badge } from "@opai/ui/components/ui/badge";
import { TrendDownIcon, TrendUpIcon } from "@opai/ui/icon";

import { m } from "@/paraglide/messages.js";

import { formatChange } from "./format";

// Below 5% either way, a change reads as flat: small sites move a few
// visitors from one week to the next.
const FLAT = 0.05;

/** A change from the previous window, with an icon and a sign so it never relies on color. */
export function Trend({ value }: { value: Change }) {
  if (value === null) {
    return <Badge variant="success">{m.analytics_trend_new()}</Badge>;
  }
  if (Math.abs(value) < FLAT) {
    return <Badge variant="neutral">{formatChange(value)}</Badge>;
  }
  const up = value > 0;
  return (
    <Badge variant={up ? "success" : "error"}>
      {up ? <TrendUpIcon aria-hidden /> : <TrendDownIcon aria-hidden />}
      {formatChange(value)}
    </Badge>
  );
}
