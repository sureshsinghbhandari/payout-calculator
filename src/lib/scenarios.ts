/**
 * "What if" scenarios shown next to the visitor's selected schedule.
 *
 * - Longer payout periods: the same investment and payout type, paid less often,
 *   each at that frequency's rate (Quarterly -> Half-Yearly and Yearly;
 *   Half-Yearly -> Yearly; Yearly has none). Only payout terms on offer are
 *   compared.
 * - Other payout type: the same frequency and rate, with the other payout type.
 *
 * Rates are server-side only. `toPublicScenarioSet` removes them before results
 * are sent to the browser.
 */
import {
  calculatePayoutSchedule,
  PERIODS_PER_YEAR,
  type PayoutFrequency,
  type PayoutInputs,
  type PayoutRow,
  type PayoutSchedule,
  type PayoutTotals,
  type PayoutType,
} from "./payout";
import type { RateTable } from "./rates";

export const FREQUENCY_ORDER: PayoutFrequency[] = ["quarterly", "half-yearly", "yearly"];

/** Offered frequencies that pay less often than `frequency`, shortest interval first. */
export function longerFrequencies(
  frequency: PayoutFrequency,
  offered: readonly PayoutFrequency[] = FREQUENCY_ORDER,
): PayoutFrequency[] {
  return FREQUENCY_ORDER.filter((f) => offered.includes(f) && PERIODS_PER_YEAR[f] < PERIODS_PER_YEAR[frequency]);
}

export function otherPayoutType(type: PayoutType): PayoutType {
  return type === "interest-only" ? "interest-and-principal" : "interest-only";
}

export interface ScenarioSet {
  selected: PayoutSchedule;
  /** Same payout type, each longer frequency at its own rate. */
  longerFrequencies: PayoutSchedule[];
  /** Same frequency and rate, the other payout type. */
  otherPayoutType: PayoutSchedule;
}

/** Visitor inputs without the rate. */
export type QuoteInputs = Omit<PayoutInputs, "annualRatePercent">;

/**
 * Calculates the selected schedule and all scenarios using the rate table.
 * `offered` limits the longer-period scenarios to the payout terms on offer.
 */
export function buildScenarios(
  inputs: QuoteInputs,
  rates: RateTable,
  offered: readonly PayoutFrequency[] = FREQUENCY_ORDER,
): ScenarioSet {
  const selected = calculatePayoutSchedule({ ...inputs, annualRatePercent: rates[inputs.frequency] });
  return {
    selected,
    longerFrequencies: longerFrequencies(inputs.frequency, offered).map((frequency) =>
      calculatePayoutSchedule({ ...inputs, frequency, annualRatePercent: rates[frequency] }),
    ),
    otherPayoutType: calculatePayoutSchedule({
      ...inputs,
      payoutType: otherPayoutType(inputs.payoutType),
      annualRatePercent: rates[inputs.frequency],
    }),
  };
}

/** A schedule as sent to the browser: everything except the rate. */
export interface PublicSchedule {
  inputs: QuoteInputs;
  startDate: string;
  periodsPerYear: number;
  totalPeriods: number;
  rows: PayoutRow[];
  totals: PayoutTotals;
}

export interface PublicScenarioSet {
  selected: PublicSchedule;
  longerFrequencies: PublicSchedule[];
  otherPayoutType: PublicSchedule;
}

export function toPublicSchedule(schedule: PayoutSchedule): PublicSchedule {
  // Copy field by field so nothing rate-related can leak through.
  const { principal, lockInYears, payoutType, frequency, investmentDate } = schedule.inputs;
  return {
    inputs: { principal, lockInYears, payoutType, frequency, investmentDate },
    startDate: schedule.startDate,
    periodsPerYear: schedule.periodsPerYear,
    totalPeriods: schedule.totalPeriods,
    rows: schedule.rows.map((row) => ({ ...row })),
    totals: { ...schedule.totals },
  };
}

export function toPublicScenarioSet(set: ScenarioSet): PublicScenarioSet {
  return {
    selected: toPublicSchedule(set.selected),
    longerFrequencies: set.longerFrequencies.map(toPublicSchedule),
    otherPayoutType: toPublicSchedule(set.otherPayoutType),
  };
}

interface ScheduleNumbers {
  rows: PayoutRow[];
  totals: PayoutTotals;
}

export interface ScheduleMetrics {
  payouts: number;
  firstPayoutCents: number;
  finalPayoutCents: number;
  totalInterestCents: number;
  totalPrincipalCents: number;
  totalPaidCents: number;
}

export function scheduleMetrics(schedule: ScheduleNumbers): ScheduleMetrics {
  const { rows, totals } = schedule;
  return {
    payouts: rows.length,
    firstPayoutCents: rows[0].totalPayoutCents,
    finalPayoutCents: rows[rows.length - 1].totalPayoutCents,
    totalInterestCents: totals.interestCents,
    totalPrincipalCents: totals.principalCents,
    totalPaidCents: totals.payoutCents,
  };
}

/** Total paid by `schedule` minus total paid by `baseline`, in cents. */
export function differenceInCents(schedule: ScheduleNumbers, baseline: ScheduleNumbers): number {
  return schedule.totals.payoutCents - baseline.totals.payoutCents;
}
