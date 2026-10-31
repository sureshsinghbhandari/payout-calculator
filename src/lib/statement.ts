/**
 * Investment statements: the data behind the "Download statement" Excel file.
 *
 * The data is built on the server (the schedule needs the earnings rate) and
 * sent to the browser, which turns it into an .xlsx file. The investor's
 * version never contains the rate or who recorded a payment; only the admin
 * version does.
 */
import type { Investment, Investor } from "./accounts";
import { maturityDate, payoutsWithStatus, scheduleOrNull, type PayoutStatus } from "./investments";
import type { PayoutFrequency, PayoutTotals, PayoutType } from "./payout";

export interface StatementRow {
  payoutNumber: number;
  payoutDate: string;
  openingPrincipalCents: number;
  interestCents: number;
  principalRepaymentCents: number;
  totalPayoutCents: number;
  remainingPrincipalCents: number;
  status: PayoutStatus;
  /** Recorded payment, if paid. */
  paidOn: string | null;
  paidCents: number | null;
  reference: string;
  /** Admin version only. */
  recordedBy?: string;
}

export interface StatementData {
  investorName: string;
  investorUsername: string;
  /** Date the statement was made (UTC), YYYY-MM-DD. */
  preparedOn: string;
  /** True for the admin version, which includes the rate and who recorded payments. */
  forAdmin: boolean;
  principal: number;
  investmentDate: string;
  startDate: string;
  maturityDate: string;
  lockInYears: number;
  frequency: PayoutFrequency;
  payoutType: PayoutType;
  /** Admin version only. */
  annualRatePercent?: number;
  totals: PayoutTotals;
  paidCents: number;
  rows: StatementRow[];
}

export type StatementResult = { ok: true; data: StatementData } | { ok: false; error: string };

/** Statement data for one investment, or null when its schedule cannot be calculated. */
export function buildStatementData(
  investor: Pick<Investor, "name" | "username">,
  investment: Investment,
  today: string,
  options: { forAdmin: boolean },
): StatementData | null {
  const schedule = scheduleOrNull(investment);
  if (!schedule) return null;
  const { forAdmin } = options;
  const rows: StatementRow[] = payoutsWithStatus(investment, schedule, today).map((row) => ({
    payoutNumber: row.payoutNumber,
    payoutDate: row.payoutDate,
    openingPrincipalCents: row.openingPrincipalCents,
    interestCents: row.interestCents,
    principalRepaymentCents: row.principalRepaymentCents,
    totalPayoutCents: row.totalPayoutCents,
    remainingPrincipalCents: row.remainingPrincipalCents,
    status: row.status,
    paidOn: row.payment?.paidOn ?? null,
    paidCents: row.payment?.amountCents ?? null,
    reference: row.payment?.reference ?? "",
    ...(forAdmin && row.payment ? { recordedBy: row.payment.recordedBy } : {}),
  }));
  return {
    investorName: investor.name,
    investorUsername: investor.username,
    preparedOn: today,
    forAdmin,
    principal: investment.principal,
    investmentDate: investment.investmentDate,
    startDate: schedule.startDate,
    maturityDate: maturityDate(schedule),
    lockInYears: investment.lockInYears,
    frequency: investment.frequency,
    payoutType: investment.payoutType,
    ...(forAdmin ? { annualRatePercent: investment.annualRatePercent } : {}),
    totals: schedule.totals,
    paidCents: rows.reduce((sum, r) => sum + (r.paidCents ?? 0), 0),
    rows,
  };
}

export function statementFileName(data: StatementData): string {
  const name = data.investorUsername.replace(/[^a-z0-9._-]/gi, "") || "investor";
  return `statement-${name}-${data.principal}-${data.investmentDate}.xlsx`;
}
