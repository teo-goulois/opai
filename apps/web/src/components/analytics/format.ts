import { getLocale } from "@/paraglide/runtime.js";

// Number formats of the Analytics pages, in the interface language.

export function formatNumber(value: number) {
  return new Intl.NumberFormat(getLocale()).format(value);
}

/** A share from 0 to 1, as a whole percentage. */
export function formatShare(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat(getLocale(), { style: "percent", maximumFractionDigits: 0 }).format(
    value,
  );
}

/** A change from 0.25 to "+25 %". */
export function formatChange(value: number) {
  return new Intl.NumberFormat(getLocale(), {
    style: "percent",
    maximumFractionDigits: 0,
    signDisplay: "exceptZero",
  }).format(value);
}

/** Seconds as "1 min 05 s" or "42 s". */
export function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes === 0) return `${rest} s`;
  return `${minutes} min ${String(rest).padStart(2, "0")} s`;
}

/**
 * A bucket of the time series: a day, or an hour for the 24-hour period.
 * Umami already shifted the buckets to the server's time zone and labels them
 * in UTC, so they are read back in UTC.
 */
export function formatBucket(at: string, unit: "hour" | "day") {
  const date = new Date(at);
  return new Intl.DateTimeFormat(
    getLocale(),
    unit === "hour"
      ? { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }
      : { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" },
  ).format(date);
}
