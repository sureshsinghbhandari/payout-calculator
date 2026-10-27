/**
 * Validation of the visitor's quote request. Server actions are public
 * endpoints, so every field is checked on the server, not just in the form.
 * Only the amounts, terms and payout terms currently offered are accepted.
 */
import { PERIODS_PER_YEAR, PAYOUT_TYPE_LABELS, validateInvestmentDate, type PayoutType } from "./payout";
import {
  defaultProductSettings,
  describeTerms,
  isOfferedAmount,
  isOfferedFrequency,
  isOfferedTerm,
  type ProductSettings,
} from "./products";
import type { QuoteInputs } from "./scenarios";

export type QuoteParse = { ok: true; value: QuoteInputs } | { ok: false; error: string };

export function parseQuoteInputs(input: unknown, products: ProductSettings = defaultProductSettings()): QuoteParse {
  if (typeof input !== "object" || input === null) return { ok: false, error: "Invalid request." };
  const raw = input as Record<string, unknown>;

  const principal = raw.principal;
  if (!isOfferedAmount(products, principal)) {
    return { ok: false, error: "Choose one of the listed investment amounts." };
  }
  const lockInYears = raw.lockInYears;
  if (!isOfferedTerm(products, lockInYears)) {
    return { ok: false, error: `Choose a term of ${describeTerms(products.terms)}.` };
  }
  const frequency = raw.frequency;
  if (typeof frequency !== "string" || !Object.hasOwn(PERIODS_PER_YEAR, frequency)) {
    return { ok: false, error: "Choose a payout term." };
  }
  if (!isOfferedFrequency(products, frequency)) {
    return { ok: false, error: "Choose one of the listed payout terms." };
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
      frequency,
      payoutType: payoutType as PayoutType,
      investmentDate: date.value,
    },
  };
}
