import type { LaunchSchedule } from "@opai/context/automations";

import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

// Schedules in words: a Codex RRULE ("FREQ=DAILY;BYHOUR=8;BYMINUTE=0"), or a
// launchd agent's StartInterval and StartCalendarInterval.

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** "Monday", in the page's language. 2023-01-01 was a Sunday. */
function weekday(index: number) {
  return new Intl.DateTimeFormat(getLocale(), { weekday: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2023, 0, 1 + index)),
  );
}

function list(items: string[]) {
  return new Intl.ListFormat(getLocale(), { type: "conjunction" }).format(items);
}

const clock = (hour: number, minute: number) =>
  `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

const numbers = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .filter(Boolean)
    .map(Number)
    .filter((number) => Number.isInteger(number));

/** The times of a day: every hour × every minute, then BYSETPOS's picks. */
function times(rule: Map<string, string>) {
  const hours = numbers(rule.get("BYHOUR"));
  if (hours.length === 0) return [];
  const minutes = numbers(rule.get("BYMINUTE"));
  const all = [...hours]
    .sort((a, b) => a - b)
    .flatMap((hour) =>
      (minutes.length > 0 ? [...minutes].sort((a, b) => a - b) : [0]).map((minute) =>
        clock(hour, minute),
      ),
    );
  const picks = numbers(rule.get("BYSETPOS"));
  if (picks.length === 0) return all;
  return picks.flatMap((pick) => {
    const time = pick > 0 ? all[pick - 1] : all[all.length + pick];
    return time ? [time] : [];
  });
}

/** "at 08:00", "at 08:00 and 20:00", "9 times, from 00:00 to 22:00". */
function timesText(day: string[]) {
  if (day.length === 0) return "";
  if (day.length <= 3) return m.automations_at({ times: list(day) });
  return m.automations_times_between({ count: day.length, from: day[0]!, to: day.at(-1)! });
}

function daysText(days: string[]) {
  const indexes = days
    .map((day) => DAYS.indexOf(day.slice(-2)))
    .filter((index) => index >= 0)
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (indexes.join() === "1,2,3,4,5") return m.automations_weekdays();
  return m.automations_every_weekday({ days: list(indexes.map(weekday)) });
}

/** A Codex automation's RRULE in words; the rule itself when it says more than that. */
export function rruleText(value: string) {
  if (!value) return m.automations_no_schedule();
  const rule = new Map(
    value
      .replace(/^RRULE:/, "")
      .split(";")
      .map((part) => part.split("=") as [string, string]),
  );
  const interval = Number(rule.get("INTERVAL") ?? 1) || 1;
  const day = times(rule);
  const dayText = timesText(day);
  // "Every day at 08:00", but "Every day, 9 times, from 00:00 to 22:00".
  const join = (when: string, at: string) =>
    at ? `${when}${day.length > 3 ? "," : ""} ${at}` : when;
  switch (rule.get("FREQ")) {
    case "MINUTELY":
      return m.automations_every_minutes({ count: interval });
    case "HOURLY":
      return m.automations_every_hours({ count: interval });
    case "DAILY":
      return join(
        interval === 1 ? m.automations_every_day() : m.automations_every_days({ count: interval }),
        dayText,
      );
    case "WEEKLY": {
      const days = rule.get("BYDAY");
      return join(days ? daysText(days.split(",")) : m.automations_every_week(), dayText);
    }
    default:
      return value;
  }
}

/** A launchd agent's schedule in words. */
export function launchText(schedule: LaunchSchedule) {
  const parts: string[] = [];
  if (schedule.everySeconds) {
    parts.push(
      schedule.everySeconds % 60 === 0
        ? m.automations_every_minutes({ count: schedule.everySeconds / 60 })
        : m.automations_every_seconds({ count: schedule.everySeconds }),
    );
  }
  for (const entry of schedule.calendar ?? []) {
    if (entry.hour === undefined) {
      parts.push(m.automations_calendar());
      continue;
    }
    const time = m.automations_at({ times: clock(entry.hour, entry.minute ?? 0) });
    const day =
      entry.weekday === undefined
        ? m.automations_every_day()
        : m.automations_every_weekday({ days: weekday(entry.weekday % 7) });
    parts.push(`${day} ${time}`);
  }
  if (schedule.keepAlive) parts.push(m.automations_kept_alive());
  else if (schedule.atLoad) parts.push(m.automations_at_load());
  if (parts.length === 0) return m.automations_no_schedule();
  return parts
    .map((part, index) =>
      index === 0
        ? part.charAt(0).toUpperCase() + part.slice(1)
        : part.charAt(0).toLowerCase() + part.slice(1),
    )
    .join(", ");
}
