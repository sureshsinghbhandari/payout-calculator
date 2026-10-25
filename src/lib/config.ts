import type { PayoutFrequency, PayoutType } from "./payout";

/**
 * Standard annual interest rate (in percent) for each payout frequency.
 *
 * The rate field pre-fills with the rate for the selected frequency, and the
 * longer-payout-period comparisons use these rates. Visitors can still type
 * their own rate. Edit these numbers to change the defaults.
 */
export const DEFAULT_RATE_BY_FREQUENCY: Record<PayoutFrequency, number> = {
  quarterly: 8,
  "half-yearly": 9,
  yearly: 10,
};

export const INVESTMENT_AMOUNTS = [25_000, 50_000, 75_000, 100_000] as const;
export const DEFAULT_INVESTMENT_AMOUNT = 50_000;

export const LOCK_IN_YEARS = [1, 2] as const;
export const DEFAULT_LOCK_IN_YEARS = 1;

export const DEFAULT_FREQUENCY: PayoutFrequency = "quarterly";
export const DEFAULT_PAYOUT_TYPE: PayoutType = "interest-only";

/** Maximum number of decimal places accepted for the annual rate. */
export const MAX_RATE_DECIMALS = 4;
