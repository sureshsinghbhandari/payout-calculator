/**
 * Payout calendar: every scheduled payout across all investors, filtered to a
 * date range and grouped by week or month. Pure helpers for /admin/payouts.
 */
import type { Investor } from "./accounts";
import { addDays, dayOfWeek, isValidIsoDate } from "./dates";
import { payoutsWithStatus, scheduleOrNull, type PayoutStatus } from "./investments";

export interface CalendarEntry {
  investorId: string;
  investorName: string;
  investmentId: string;
  /** Position of the investment on the investor's page (1-based). */
  investmentNumber: number;
  principal: number;
  payoutNumber: number;
  totalPayouts: number;
  payoutDate: string;
  scheduledCents: number;
  status: PayoutStatus;
  paidOn: string | null;
  paidCents: number | null;
}

/** All scheduled payouts of all investors, sorted by date. */
export function collectPayouts(investors: readonly Investor[], today: string): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  for (const investor of investors) {
    investor.investments.forEach((investment, index) => {
      const schedule = scheduleOrNull(investment);
      if (!schedule) return;
      for (const row of payoutsWithStatus(investment, schedule, today)) {
        entries.push({
          investorId: investor.id,
          investorName: investor.name,
          investmentId: investment.id,
          investmentNumber: index + 1,
          principal: investment.principal,
          payoutNumber: row.payoutNumber,
          totalPayouts: schedule.rows.length,
          payoutDate: row.payoutDate,
          scheduledCents: row.totalPayoutCents,
          status: row.status,
          paidOn: row.payment?.paidOn ?? null,
          paidCents: row.payment?.amountCents ?? null,
        });
      }
    });
  }
  return entries.sort(
    (a, b) =>
      a.payoutDate.localeCompare(b.payoutDate) ||
      a.investorName.localeCompare(b.investorName) ||
      a.payoutNumber - b.payoutNumber,
  );
}

export type CalendarGrouping = "week" | "month";

export const DEFAULT_RANGE_DAYS = 90;
/** Longest range shown at once, in days (about five years). */
export const MAX_RANGE_DAYS = 1830;

export interface CalendarRange {
  from: string;
  to: string;
  group: CalendarGrouping;
  /** Set when the requested range was not valid and the default is shown instead. */
  error?: string;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The range and grouping from the page's search parameters (default: today and the next 90 days, by week). */
export function parseCalendarRange(
  params: Record<string, string | string[] | undefined>,
  today: string,
): CalendarRange {
  const group: CalendarGrouping = params.group === "month" ? "month" : "week";
  const fallback = { from: today, to: addDays(today, DEFAULT_RANGE_DAYS), group };
  const from = typeof params.from === "string" ? params.from : "";
  const to = typeof params.to === "string" ? params.to : "";
  if (from === "" && to === "") return fallback;
  if (!isValidIsoDate(from) || !isValidIsoDate(to)) {
    return { ...fallback, error: "Enter a valid start and end date. Showing the next 90 days instead." };
  }
  if (to < from) return { ...fallback, error: "The end date is before the start date. Showing the next 90 days instead." };
  if (daysBetween(from, to) > MAX_RANGE_DAYS) {
    return { ...fallback, error: "Choose a range of at most five years. Showing the next 90 days instead." };
  }
  return { from, to, group };
}

/** The Monday on or before the date. */
export function weekStart(iso: string): string {
  return addDays(iso, -((dayOfWeek(iso) + 6) % 7));
}

export interface CalendarGroup {
  key: string;
  /** First day of the week or month, YYYY-MM-DD. */
  start: string;
  entries: CalendarEntry[];
  scheduledCents: number;
  paidCents: number;
}

/** Groups date-sorted entries by week (Monday to Sunday) or calendar month. */
export function groupPayouts(entries: readonly CalendarEntry[], grouping: CalendarGrouping): CalendarGroup[] {
  const groups: CalendarGroup[] = [];
  for (const entry of entries) {
    const start = grouping === "week" ? weekStart(entry.payoutDate) : `${entry.payoutDate.slice(0, 7)}-01`;
    let group = groups.at(-1);
    if (!group || group.key !== start) {
      group = { key: start, start, entries: [], scheduledCents: 0, paidCents: 0 };
      groups.push(group);
    }
    group.entries.push(entry);
    group.scheduledCents += entry.scheduledCents;
    group.paidCents += entry.paidCents ?? 0;
  }
  return groups;
}

export function sumScheduled(entries: readonly CalendarEntry[]): number {
  return entries.reduce((sum, e) => sum + e.scheduledCents, 0);
}
