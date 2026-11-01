/**
 * The accounts (tabs of the separate trading app) the Trading dashboard shows
 * and keeps saved copies of, in display order. The slug is that app's tab slug
 * (its `/api/public/eod-excel/tabs`). Only these are fetched, saved and shown;
 * add a line here to include another one.
 */
export const TRADING_ACCOUNTS = [
  { slug: "simulator", label: "Simulator" },
  { slug: "tradier-sb-live", label: "Tradier_SB Live" },
] as const;

export type TradingAccount = (typeof TRADING_ACCOUNTS)[number];

export function findTradingAccount(slug: string | null | undefined): TradingAccount | undefined {
  return TRADING_ACCOUNTS.find((account) => account.slug === slug);
}
