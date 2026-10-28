/**
 * Every time shown in the app is US Eastern Time: EST in winter, EDT in
 * summer (the label switches by itself). Stored timestamps stay UTC; this is
 * only how they are shown, and how "today" and "the day something was
 * received" are worked out for the screens.
 */
export const DISPLAY_TIME_ZONE = "America/New_York";
export const DISPLAY_TIME_ZONE_LABEL = "Eastern Time";

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: DISPLAY_TIME_ZONE,
  timeZoneName: "short",
});

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: DISPLAY_TIME_ZONE,
});

/** An ISO timestamp as e.g. "Oct 27, 2026, 3:34 PM EDT" (empty when it is not a date). */
export function formatTimestamp(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "" : timestampFormatter.format(new Date(ms));
}

/** The calendar day (YYYY-MM-DD) an ISO timestamp falls on in Eastern Time. */
export function easternDay(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "1970-01-01";
  const parts = Object.fromEntries(dayFormatter.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Today's date (YYYY-MM-DD) in Eastern Time. */
export function todayEastern(now: Date = new Date()): string {
  return easternDay(now.toISOString());
}
