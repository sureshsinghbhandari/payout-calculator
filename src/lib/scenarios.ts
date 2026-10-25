/**
 * "What if" scenarios shown next to the visitor's selected schedule.
 *
 * - Longer payout periods: the same investment and payout type, paid less often,
 *   each at the standard rate for that frequency (e.g. Quarterly -> Half-Yearly
 *   and Yearly; Half-Yearly -> Yearly; Yearly has none).
 * - Other payout type: the same frequency and rate, with the other payout type.
 */
import { DEFAULT_RATE_BY_FREQUENCY } from "./config";
import {
  calculatePayoutSchedule,
  PERIODS_PER_YEAR,
  type PayoutFrequency,
  type PayoutSchedule,
  type PayoutType,
} from "./payout";

export const FREQUENCY_ORDER: PayoutFrequency[] = ["quarterly", "half-yearly", "yearly"];

/** Frequencies that pay less often than `frequency`, shortest interval first. */
export function longerFrequencies(frequency: PayoutFrequency): PayoutFrequency[] {
  return FREQUENCY_ORDER.filter((f) => PERIODS_PER_YEAR[f] < PERIODS_PER_YEAR[frequency]);
}

export function otherPayoutType(type: PayoutType): PayoutType {
  return type === "interest-only" ? "interest-and-principal" : "interest-only";
}

export interface ScenarioSet {
  selected: PayoutSchedule;
  /** Same payout type, each longer frequency at its standard rate. */
  longerFrequencies: PayoutSchedule[];
  /** Same frequency and rate, the other payout type. */
  otherPayoutType: PayoutSchedule;
}

export function buildScenarios(selected: PayoutSchedule): ScenarioSet {
  const base = selected.inputs;
  return {
    selected,
    longerFrequencies: longerFrequencies(base.frequency).map((frequency) =>
      calculatePayoutSchedule({
        ...base,
        frequency,
        annualRatePercent: DEFAULT_RATE_BY_FREQUENCY[frequency],
      }),
    ),
    otherPayoutType: calculatePayoutSchedule({ ...base, payoutType: otherPayoutType(base.payoutType) }),
  };
}

export interface ScheduleMetrics {
  payouts: number;
  firstPayoutCents: number;
  finalPayoutCents: number;
  totalInterestCents: number;
  totalPrincipalCents: number;
  totalPaidCents: number;
}

export function scheduleMetrics(schedule: PayoutSchedule): ScheduleMetrics {
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
export function differenceInCents(schedule: PayoutSchedule, baseline: PayoutSchedule): number {
  return schedule.totals.payoutCents - baseline.totals.payoutCents;
}

/** Whether the rate of `schedule` matches the standard rate for its frequency. */
export function usesStandardRate(schedule: PayoutSchedule): boolean {
  return schedule.inputs.annualRatePercent === DEFAULT_RATE_BY_FREQUENCY[schedule.inputs.frequency];
}
