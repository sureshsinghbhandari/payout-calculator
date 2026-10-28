/**
 * Figures for the admin dashboard. Pure functions so they can be unit tested.
 */
import type { Investor } from "./accounts";
import { addDays, dayOfWeek } from "./dates";
import type { InquiryStatus, StoredInquiry } from "./inquiry";
import { calculatePayoutSchedule } from "./payout";
import { easternDay } from "./time";

export interface WeekCount {
  /** Monday the week starts on (Eastern Time), YYYY-MM-DD. */
  weekStart: string;
  count: number;
}

/**
 * Inquiries received per week (Monday to Sunday, Eastern Time) for the last `weeks`
 * weeks, oldest first. The last week is the current one, so far. Deleted
 * inquiries are left out.
 */
export function inquiriesPerWeek(inquiries: StoredInquiry[], today: string, weeks = 8): WeekCount[] {
  const thisMonday = addDays(today, -((dayOfWeek(today) + 6) % 7));
  const result: WeekCount[] = [];
  for (let i = weeks - 1; i >= 0; i--) result.push({ weekStart: addDays(thisMonday, -7 * i), count: 0 });
  for (const inquiry of inquiries) {
    if (inquiry.status === "deleted") continue;
    const day = easternDay(inquiry.createdAt);
    // The last week that starts on or before the inquiry's day.
    for (let i = result.length - 1; i >= 0; i--) {
      if (day >= result[i].weekStart) {
        if (day < addDays(result[i].weekStart, 7)) result[i].count++;
        break;
      }
    }
  }
  return result;
}

export function countByStatus(inquiries: StoredInquiry[]): Record<InquiryStatus, number> {
  const counts: Record<InquiryStatus, number> = { new: 0, contacted: 0, converted: 0, deleted: 0 };
  for (const inquiry of inquiries) counts[inquiry.status]++;
  return counts;
}

/** Converted inquiries as a share of all inquiries that are not deleted, 0 to 1 (null when there are none). */
export function conversionRate(counts: Record<InquiryStatus, number>): number | null {
  const total = counts.new + counts.contacted + counts.converted;
  return total === 0 ? null : counts.converted / total;
}

export interface UpcomingPayouts {
  days: number;
  count: number;
  cents: number;
}

export interface InvestmentTotals {
  investors: number;
  investments: number;
  /** Sum of all investment principals, whole dollars. */
  investedDollars: number;
  /** Scheduled payouts after today, within each number of days asked for. */
  upcoming: UpcomingPayouts[];
  /** Investments whose schedule could not be calculated (left out of the payouts). */
  skipped: number;
}

/**
 * Totals across all investors. Upcoming payouts come from each investment's
 * payout schedule (payouts dated after `today`, up to and including
 * today + days); recorded payments are not taken into account.
 */
export function investmentTotals(investors: Investor[], today: string, periods: number[]): InvestmentTotals {
  const upcoming = periods.map((days) => ({ days, count: 0, cents: 0, until: addDays(today, days) }));
  let investments = 0;
  let investedDollars = 0;
  let skipped = 0;
  for (const investor of investors) {
    for (const investment of investor.investments) {
      investments++;
      investedDollars += investment.principal;
      let rows;
      try {
        rows = calculatePayoutSchedule({
          principal: investment.principal,
          annualRatePercent: investment.annualRatePercent,
          lockInYears: investment.lockInYears,
          payoutType: investment.payoutType,
          frequency: investment.frequency,
          investmentDate: investment.investmentDate,
        }).rows;
      } catch {
        skipped++;
        continue;
      }
      for (const row of rows) {
        if (row.payoutDate <= today) continue;
        for (const period of upcoming) {
          if (row.payoutDate <= period.until) {
            period.count++;
            period.cents += row.totalPayoutCents;
          }
        }
      }
    }
  }
  return {
    investors: investors.length,
    investments,
    investedDollars,
    upcoming: upcoming.map(({ days, count, cents }) => ({ days, count, cents })),
    skipped,
  };
}
