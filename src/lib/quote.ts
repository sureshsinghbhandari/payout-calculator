/**
 * Validation of the visitor's quote request. Server actions are public
 * endpoints, so every field is checked on the server, not just in the form.
 */
import { INVESTMENT_AMOUNTS, LOCK_IN_YEARS } from "./config";
import { PERIODS_PER_YEAR, PAYOUT_TYPE_LABELS, validateInvestmentDate, type PayoutFrequency, type PayoutType } from "./payout";
import type { QuoteInputs } from "./scenarios";

export type QuoteParse = { ok: true; value: QuoteInputs } | { ok: false; error: string };

export function parseQuoteInputs(input: unknown): QuoteParse {
  if (typeof input !== "object" || input === null) return { ok: false, error: "Invalid request." };
  const raw = input as Record<string, unknown>;

  const principal = raw.principal;
  if (typeof principal !== "number" || !(INVESTMENT_AMOUNTS as readonly number[]).includes(principal)) {
    return { ok: false, error: "Choose one of the listed investment amounts." };
  }
  const lockInYears = raw.lockInYears;
  if (typeof lockInYears !== "number" || !(LOCK_IN_YEARS as readonly number[]).includes(lockInYears)) {
    return { ok: false, error: "Choose a lock-in period of 1 or 2 years." };
  }
  const frequency = raw.frequency;
  if (typeof frequency !== "string" || !Object.hasOwn(PERIODS_PER_YEAR, frequency)) {
    return { ok: false, error: "Choose a payout period." };
  }
  const payoutType = raw.payoutType;
  if (typeof payoutType !== "string" || !Object.hasOwn(PAYOUT_TYPE_LABELS, payoutType)) {
    return { ok: false, error: "Choose a payout type." };
  }
  const date = validateInvestmentDate(typeof raw.investmentDate === "string" ? raw.investmentDate : "");
  if (!date.ok) return { ok: false, error: date.error };

  return {
    ok: true,
    value: {
      principal,
      lockInYears,
      frequency: frequency as PayoutFrequency,
      payoutType: payoutType as PayoutType,
      investmentDate: date.value,
    },
  };
}
