import type { PayoutFrequency, PayoutType } from "./payout";

/**
 * Starting annual interest rate (in percent) for each payout frequency.
 *
 * These apply until an admin saves rates on the /admin page; after that the
 * saved rates are used. Rates are never shown to visitors.
 */
export const DEFAULT_RATE_BY_FREQUENCY: Record<PayoutFrequency, number> = {
  quarterly: 8,
  "half-yearly": 9,
  yearly: 10,
};

export const INVESTMENT_AMOUNTS = [25_000, 50_000, 75_000, 100_000] as const;
export const DEFAULT_INVESTMENT_AMOUNT = 100_000;

export const LOCK_IN_YEARS = [1, 2] as const;
export const DEFAULT_LOCK_IN_YEARS = 2;

export const DEFAULT_FREQUENCY: PayoutFrequency = "yearly";
export const DEFAULT_PAYOUT_TYPE: PayoutType = "interest-only";

/**
 * Interest starts this many business days (Monday to Friday) after the
 * investment date. Holidays are not taken into account.
 */
export const INTEREST_START_BUSINESS_DAYS = 1;

/** Earliest and latest investment dates the form accepts (YYYY-MM-DD). */
export const INVESTMENT_DATE_MIN = "2000-01-01";
export const INVESTMENT_DATE_MAX = "2099-12-31";

/** Maximum number of decimal places accepted for an annual rate. */
export const MAX_RATE_DECIMALS = 4;
