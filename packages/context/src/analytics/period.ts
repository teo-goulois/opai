import { z } from "zod";

export const Period = z.enum(["24h", "7d", "30d", "90d"]);
export type Period = z.infer<typeof Period>;

const DAY = 86_400_000;

const days: Record<Period, number> = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 };

export type Range = {
  startAt: number;
  endAt: number;
  /** Bucket size of the time series. */
  unit: "hour" | "day";
};

const MINUTE = 60_000;

/**
 * The window that ends now, rounded down to the minute. Umami compares it
 * with the window of the same length just before.
 */
export function periodRange(period: Period, now = Date.now()): Range {
  const endAt = Math.floor(now / MINUTE) * MINUTE;
  return { startAt: endAt - days[period] * DAY, endAt, unit: period === "24h" ? "hour" : "day" };
}
