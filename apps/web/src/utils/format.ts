import { getLocale } from "@/paraglide/runtime.js";

/** "12 oct." */
export function formatDate(at: string) {
  return new Intl.DateTimeFormat(getLocale(), { day: "numeric", month: "short" }).format(
    new Date(at),
  );
}

/** "il y a 5 minutes", "il y a 3 jours", "today"... */
export function formatRelative(at: string) {
  const ms = Date.parse(at) - Date.now();
  const format = new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto" });
  if (Math.abs(ms) < 3_600_000) return format.format(Math.round(ms / 60_000), "minute");
  const days = Math.round(ms / 86_400_000);
  if (Math.abs(days) < 1) return format.format(Math.round(ms / 3_600_000), "hour");
  return Math.abs(days) < 60 ? format.format(days, "day") : formatDate(at);
}
