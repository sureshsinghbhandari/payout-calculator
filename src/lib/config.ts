/**
 * Calculator defaults. Change DEFAULT_ANNUAL_RATE_PERCENT to set the interest
 * rate that pre-fills the form (and that the Reset button restores).
 */
export const DEFAULT_ANNUAL_RATE_PERCENT = 10;

export const INVESTMENT_AMOUNTS = [25_000, 50_000, 75_000, 100_000] as const;
export const DEFAULT_INVESTMENT_AMOUNT = 50_000;

export const LOCK_IN_YEARS = [1, 2] as const;
export const DEFAULT_LOCK_IN_YEARS = 1;

/** Maximum number of decimal places accepted for the annual rate. */
export const MAX_RATE_DECIMALS = 4;
