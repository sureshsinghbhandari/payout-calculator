/**
 * Payout schedule engine.
 *
 * All money is handled as integer cents and the rate as an integer number of
 * ten-thousandths of a percent, so every calculation is exact integer math
 * (well inside Number.MAX_SAFE_INTEGER) and fully deterministic.
 * Interest is simple interest; it is never compounded.
 */
import {
  INTEREST_START_BUSINESS_DAYS,
  INVESTMENT_DATE_MAX,
  INVESTMENT_DATE_MIN,
  MAX_RATE_DECIMALS,
} from "./config";
import { addBusinessDays, addMonths, isValidIsoDate } from "./dates";

export { addMonths, isValidIsoDate, toIsoDate } from "./dates";

export type PayoutType = "interest-only" | "interest-and-principal";
export type PayoutFrequency = "quarterly" | "half-yearly" | "yearly";

export const PERIODS_PER_YEAR: Record<PayoutFrequency, number> = {
  quarterly: 4,
  "half-yearly": 2,
  yearly: 1,
};

export const FREQUENCY_LABELS: Record<PayoutFrequency, string> = {
  quarterly: "Quarterly",
  "half-yearly": "Half-Yearly",
  yearly: "Yearly",
};

export const PAYOUT_TYPE_LABELS: Record<PayoutType, string> = {
  "interest-only": "Interest Only",
  "interest-and-principal": "Interest and Principal",
};

export interface PayoutInputs {
  /** Original investment in whole US dollars. */
  principal: number;
  /** Annual simple-interest rate as a percentage, e.g. 10 for 10%. */
  annualRatePercent: number;
  lockInYears: number;
  payoutType: PayoutType;
  frequency: PayoutFrequency;
  /** Date the money is invested, as YYYY-MM-DD. */
  investmentDate: string;
}

export interface PayoutRow {
  payoutNumber: number;
  /** YYYY-MM-DD */
  payoutDate: string;
  openingPrincipalCents: number;
  interestCents: number;
  principalRepaymentCents: number;
  totalPayoutCents: number;
  remainingPrincipalCents: number;
}

export interface PayoutTotals {
  interestCents: number;
  principalCents: number;
  payoutCents: number;
}

export interface PayoutSchedule {
  inputs: PayoutInputs;
  /** Date interest starts (the next business day after the investment date), YYYY-MM-DD. */
  startDate: string;
  periodsPerYear: number;
  totalPeriods: number;
  rows: PayoutRow[];
  totals: PayoutTotals;
}

export type RateValidation =
  | { ok: true; value: number }
  | { ok: false; error: string };

const NUMBER_PATTERN = /^\+?(\d+(\.\d*)?|\.\d+)$/;

/** Validates the annual-rate field. Accepts raw text from the form or a number. */
export function validateRate(input: string | number): RateValidation {
  if (typeof input === "number" && !Number.isFinite(input)) {
    return { ok: false, error: "Interest rate must be a number, for example 10 or 7.5." };
  }
  const text = typeof input === "number" ? String(input) : input.trim();
  if (text === "") {
    return { ok: false, error: "Enter an annual interest rate." };
  }
  if (text.startsWith("-") && NUMBER_PATTERN.test(text.slice(1))) {
    return { ok: false, error: "Interest rate must be between 0% and 100%." };
  }
  if (!NUMBER_PATTERN.test(text)) {
    return { ok: false, error: "Interest rate must be a number, for example 10 or 7.5." };
  }
  const value = Number(text);
  if (value < 0 || value > 100) {
    return { ok: false, error: "Interest rate must be between 0% and 100%." };
  }
  const decimals = text.includes(".") ? text.split(".")[1].length : 0;
  if (decimals > MAX_RATE_DECIMALS) {
    return { ok: false, error: `Use at most ${MAX_RATE_DECIMALS} decimal places.` };
  }
  return { ok: true, value };
}

const RATE_SCALE = 10 ** MAX_RATE_DECIMALS; // rate units per 1%

/** Divides two non-negative integers, rounding half up. */
function divRoundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/** Simple interest in cents for `principalCents` over `yearsNum / yearsDen` years. */
function simpleInterestCents(
  principalCents: number,
  rateUnits: number,
  yearsNum: number,
  yearsDen: number,
): number {
  return divRoundHalfUp(principalCents * rateUnits * yearsNum, 100 * RATE_SCALE * yearsDen);
}

export type DateValidation = { ok: true; value: string } | { ok: false; error: string };

/** Validates the investment-date field (YYYY-MM-DD, within the allowed range). */
export function validateInvestmentDate(input: string): DateValidation {
  const text = input.trim();
  if (text === "") return { ok: false, error: "Enter a planned investment date." };
  if (!isValidIsoDate(text)) return { ok: false, error: "Enter a valid planned investment date." };
  if (text < INVESTMENT_DATE_MIN || text > INVESTMENT_DATE_MAX) {
    return {
      ok: false,
      error: `Choose a date between ${INVESTMENT_DATE_MIN.slice(0, 4)} and ${INVESTMENT_DATE_MAX.slice(0, 4)}.`,
    };
  }
  return { ok: true, value: text };
}

/** "the next business day", or "3 business days" etc. when configured differently. */
export function interestStartDelayText(): string {
  return INTEREST_START_BUSINESS_DAYS === 1
    ? "the next business day"
    : `${INTEREST_START_BUSINESS_DAYS} business days`;
}

/** The date interest starts: the configured number of business days after the investment date. */
export function interestStartDate(investmentDate: string): string {
  return addBusinessDays(investmentDate, INTEREST_START_BUSINESS_DAYS);
}

export function calculatePayoutSchedule(inputs: PayoutInputs): PayoutSchedule {
  const { principal, annualRatePercent, lockInYears, payoutType, frequency, investmentDate } = inputs;

  if (!Number.isInteger(principal) || principal <= 0) {
    throw new RangeError("Principal must be a positive whole-dollar amount.");
  }
  if (!Number.isInteger(lockInYears) || lockInYears <= 0) {
    throw new RangeError("Term must be a positive whole number of years.");
  }
  const rate = validateRate(annualRatePercent);
  if (!rate.ok) throw new RangeError(rate.error);
  const periodsPerYear = PERIODS_PER_YEAR[frequency];
  if (periodsPerYear === undefined) throw new RangeError("Unknown payout term.");
  if (payoutType !== "interest-only" && payoutType !== "interest-and-principal") {
    throw new RangeError("Unknown payout type.");
  }
  const date = validateInvestmentDate(investmentDate);
  if (!date.ok) throw new RangeError(date.error);
  const startDate = interestStartDate(date.value);

  const rateUnits = Math.round(rate.value * RATE_SCALE);
  const principalCents = principal * 100;
  const totalPeriods = lockInYears * periodsPerYear;
  const monthsPerPeriod = 12 / periodsPerYear;
  const rows: PayoutRow[] = [];

  if (payoutType === "interest-only") {
    // Total interest is principal x rate x years. Every installment is one
    // period of interest on the original principal; the final installment
    // absorbs any rounding remainder so the installments sum to that total.
    const totalInterest = simpleInterestCents(principalCents, rateUnits, lockInYears, 1);
    let periodInterest = simpleInterestCents(principalCents, rateUnits, 1, periodsPerYear);
    if (periodInterest * (totalPeriods - 1) > totalInterest) {
      // Only at tiny rates (a few cents per period) could rounding each period
      // up leave the final installment negative. Round down instead; the final
      // installment is then never smaller than the others.
      periodInterest = Math.floor((principalCents * rateUnits) / (100 * RATE_SCALE * periodsPerYear));
    }
    for (let k = 1; k <= totalPeriods; k++) {
      const isFinal = k === totalPeriods;
      const interest = isFinal ? totalInterest - periodInterest * (totalPeriods - 1) : periodInterest;
      const repayment = isFinal ? principalCents : 0;
      rows.push({
        payoutNumber: k,
        payoutDate: addMonths(startDate, k * monthsPerPeriod),
        openingPrincipalCents: principalCents,
        interestCents: interest,
        principalRepaymentCents: repayment,
        totalPayoutCents: interest + repayment,
        remainingPrincipalCents: principalCents - repayment,
      });
    }
  } else {
    // Equal principal installments; the last one reconciles rounding so the
    // outstanding principal ends at exactly zero. Interest is charged only on
    // the principal still outstanding before each installment.
    const installment = Math.floor(principalCents / totalPeriods);
    let outstanding = principalCents;
    for (let k = 1; k <= totalPeriods; k++) {
      const repayment = k === totalPeriods ? outstanding : installment;
      const interest = simpleInterestCents(outstanding, rateUnits, 1, periodsPerYear);
      rows.push({
        payoutNumber: k,
        payoutDate: addMonths(startDate, k * monthsPerPeriod),
        openingPrincipalCents: outstanding,
        interestCents: interest,
        principalRepaymentCents: repayment,
        totalPayoutCents: interest + repayment,
        remainingPrincipalCents: outstanding - repayment,
      });
      outstanding -= repayment;
    }
  }

  const totals = rows.reduce<PayoutTotals>(
    (acc, row) => ({
      interestCents: acc.interestCents + row.interestCents,
      principalCents: acc.principalCents + row.principalRepaymentCents,
      payoutCents: acc.payoutCents + row.totalPayoutCents,
    }),
    { interestCents: 0, principalCents: 0, payoutCents: 0 },
  );

  return {
    inputs: { ...inputs, annualRatePercent: rate.value, investmentDate: date.value },
    startDate,
    periodsPerYear,
    totalPeriods,
    rows,
    totals,
  };
}
