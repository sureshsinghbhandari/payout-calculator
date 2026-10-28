/**
 * Recorded investments: their payout schedules, payment status, maturity and
 * renewals. Pure helpers shared by the admin pages, the payout calendar, the
 * investor portal and statements.
 *
 * A scheduled payout is "paid" only once a Master Admin records the payment,
 * "due" from its scheduled date (UTC) until then, and "upcoming" before that.
 */
import type { Investment, PayoutPayment } from "./accounts";
import { addDays } from "./dates";
import { calculatePayoutSchedule, type PayoutRow, type PayoutSchedule } from "./payout";

export type PayoutStatus = "paid" | "due" | "upcoming";

export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  paid: "Paid",
  due: "Due",
  upcoming: "Upcoming",
};

/** Badge classes for each status (same look in the admin and the portal). */
export const PAYOUT_STATUS_BADGES: Record<PayoutStatus, string> = {
  paid: "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200",
  due: "bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-300",
  upcoming: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200",
};

/** Today's date in Eastern Time, YYYY-MM-DD. */
export { todayEastern } from "./time";

/** The payout schedule of a recorded investment (throws when it cannot be calculated). */
export function investmentSchedule(investment: Investment): PayoutSchedule {
  return calculatePayoutSchedule({
    principal: investment.principal,
    annualRatePercent: investment.annualRatePercent,
    lockInYears: investment.lockInYears,
    payoutType: investment.payoutType,
    frequency: investment.frequency,
    investmentDate: investment.investmentDate,
  });
}

/** The payout schedule, or null (logged) when it cannot be calculated. */
export function scheduleOrNull(investment: Investment): PayoutSchedule | null {
  try {
    return investmentSchedule(investment);
  } catch (error) {
    console.error(`Payout schedule for investment ${investment.id} could not be calculated`, error);
    return null;
  }
}

export function paymentFor(investment: Pick<Investment, "payments">, payoutNumber: number): PayoutPayment | null {
  return investment.payments.find((p) => p.payoutNumber === payoutNumber) ?? null;
}

export function payoutStatus(payoutDate: string, payment: PayoutPayment | null, today: string): PayoutStatus {
  if (payment) return "paid";
  return payoutDate <= today ? "due" : "upcoming";
}

export interface PayoutWithStatus extends PayoutRow {
  status: PayoutStatus;
  payment: PayoutPayment | null;
}

/** Every scheduled payout of the investment with its payment and status. */
export function payoutsWithStatus(investment: Investment, schedule: PayoutSchedule, today: string): PayoutWithStatus[] {
  return schedule.rows.map((row) => {
    const payment = paymentFor(investment, row.payoutNumber);
    return { ...row, payment, status: payoutStatus(row.payoutDate, payment, today) };
  });
}

/** The date the term ends: the date of the final payout. */
export function maturityDate(schedule: PayoutSchedule): string {
  return schedule.rows[schedule.rows.length - 1].payoutDate;
}

/** True once the term has ended (from the maturity date, UTC). */
export function isMatured(schedule: PayoutSchedule, today: string): boolean {
  return maturityDate(schedule) <= today;
}

/** The investment that renewed `investment`, if any. */
export function renewalOf(investment: Investment, all: readonly Investment[]): Investment | null {
  return all.find((i) => i.renewedFromId === investment.id) ?? null;
}

/** Latest date a payment may be recorded for: today (UTC) plus one day for time zones ahead of UTC. */
export function latestPaidOn(today: string): string {
  return addDays(today, 1);
}

/**
 * Parses a US dollar amount typed by an admin ("2,500", "$2500.5", "2500.50")
 * into integer cents, or null when it is not a valid positive amount.
 */
export function parseDollarsToCents(input: string): number | null {
  const text = input.trim().replace(/^\$/, "").replace(/,/g, "");
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents > 0 ? cents : null;
}

/** Cents as a plain dollar amount for a form field, e.g. 250050 -> "2500.50". */
export function centsToInput(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
