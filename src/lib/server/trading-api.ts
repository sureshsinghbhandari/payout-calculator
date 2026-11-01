import "server-only";

/**
 * Read-only client for the EOD trading data API of a separate app
 * (tradiersuinew, run by the owner on their own machine, reached through an
 * ngrok tunnel; see that repo's docs/eod-excel.md). Never writes anything and
 * never touches a broker; it only reads the KPI, strategy, month-sheet and
 * today's-position numbers that app already computes for its own Excel
 * export and its own Overview tab.
 *
 * Settings: TRADING_API_URL (the tunnel's base address, e.g.
 * "https://example.ngrok-free.app", no trailing slash) and TRADING_API_TOKEN
 * (the bearer token configured as EOD_EXCEL_API_TOKEN on the other app).
 * Both are required; without them the dashboard says so instead of guessing.
 *
 * The `month` section and the `today` route are the contract this app asks
 * of the other one (docs/trading-dashboard-api.md describes them in full for
 * whoever adds them there); the dashboard copes while they are missing.
 */

export interface TradingTab {
  slug: string;
  label: string;
  market: string;
  currency: string;
}

export interface TradingKpi {
  net: number | null;
  lastDay: number | null;
  monthNet: number | null;
  prevMonthNet: number | null;
  tradeWinRate: number | null;
  dayWinRate: number | null;
  profitFactor: number | null;
  maxDd: number | null;
  currentDd: number | null;
  roi: number | null;
  capital: number | null;
  expectancy: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  bestDay: number | null;
  worstDay: number | null;
  streak: number | null;
  charges: number | null;
  gross: number | null;
  sharpe: number | null;
  trades: number | null;
  tradingDays: number | null;
}

export interface TradingStrategy {
  rank: number;
  name: string;
  underlying: string | null;
  capital: number | null;
  netPnl: number | null;
  roi: number | null;
  winRate: number | null;
  avgTrade: number | null;
  profitFactor: number | null;
  maxDrawdown: { amount: number | null; from: string | null; to: string | null } | null;
  streak: { current: number | null; bestWin: number | null; bestLoss: number | null } | null;
  lastTradeDate: string | null;
}

/** One strategy column of a month sheet (the "DATE | strategy… | TOTAL | CUMULATIVE" layout of the Excel month sheets). */
export interface TradingMonthColumn {
  name: string;
  underlying: string | null;
  /** The strategy's funds allocated ("Capital Reqd"); null when none is set. */
  capital: number | null;
}

/** One trading day of a month sheet: a net figure per strategy column (0 when it had no closed trade), the day's total and the running total. */
export interface TradingMonthDay {
  /** YYYY-MM-DD, the market day the trades closed. */
  date: string;
  values: number[];
  total: number;
  cumulative: number;
}

/** Rows 2-9 of a month sheet, one entry per strategy column plus the TOTAL column. */
export interface TradingMonthSummary {
  returns: number[];
  capital: (number | null)[];
  /** returns / capital as a fraction (0.0123 = 1.23 %), null without capital. */
  roi: (number | null)[];
  profitDays: number[];
  lossDays: number[];
  total: { returns: number; capital: number | null; roi: number | null; profitDays: number; lossDays: number };
}

/** The `month` section: one month sheet, plus which months exist so the page can step through them. */
export interface TradingMonth {
  /** YYYY-MM of the sheet returned. */
  month: string;
  /** Every month that has a sheet (a closed trade), newest first, the current month always included. */
  available: string[];
  columns: TradingMonthColumn[];
  days: TradingMonthDay[];
  summary: TradingMonthSummary;
}

export interface TradingTabData {
  version: number;
  tab: TradingTab;
  generatedAt: string;
  asOf: string | null;
  sections: string[];
  kpi?: TradingKpi;
  strategies?: TradingStrategy[];
  month?: TradingMonth;
}

/** How far a short strike sits from the spot, the other app's own figure (entryDistance.ts there). */
export interface TradingDistanceSide {
  /** Index points between the spot and the short strike, always positive. */
  points: number;
  /** points / spot × 100. */
  pct: number;
  /** Ladder steps from the at-the-money strike: positive = OTM ("OTM+14"), negative = ITM ("ITM-2"), null when unknown. */
  steps: number | null;
  /** True when the spot has crossed this short strike (only meaningful for the live figure). */
  breached?: boolean;
}

export interface TradingDistance {
  put?: TradingDistanceSide | null;
  call?: TradingDistanceSide | null;
}

export interface TradingLeg {
  action: "buy" | "sell";
  type: "put" | "call";
  strike: number;
  /** Contracts of this leg (already multiplied by the position's lots). */
  quantity: number;
  /** YYYY-MM-DD; null when it is the position's own expiration. */
  expiration: string | null;
  /** The leg's mid price at entry and now (per share / per index point), null when the engine did not record it. */
  entryMid: number | null;
  mid: number | null;
  /** "open" or "closed" (a leg already bought back). */
  status: "open" | "closed";
}

export interface TradingTodayRow {
  /** A stable key for the row (the position's id in the other app). */
  id: string;
  strategy: string;
  underlying: string | null;
  /** "open" = still running, "closed" = closed or expired today. */
  status: "open" | "closed";
  /** YYYY-MM-DD. */
  expiration: string;
  /** Calendar days to expiry (0 = expires today). */
  dte: number | null;
  /** Lots (condors / spreads), not contracts. */
  quantity: number;
  /** A short description of the structure, e.g. "Iron condor", "Put credit spread". */
  structure: string | null;
  legs: TradingLeg[];
  /** The underlying's price when the position was opened and now (null when unknown). */
  entrySpot: number | null;
  liveSpot: number | null;
  /** ISO timestamps. */
  openedAt: string | null;
  closedAt: string | null;
  exitReason: string | null;
  distanceAtEntry: TradingDistance | null;
  distanceNow: TradingDistance | null;
  pnl: {
    /** The figure to show: unrealized while open, realized once closed. Net of charges, in the tab's currency. */
    current: number | null;
    unrealized: number | null;
    realized: number | null;
    /** Credit received at entry (in currency, all lots) and the position's max profit / max risk, when known. */
    entryCredit: number | null;
    maxProfit: number | null;
    maxRisk: number | null;
    charges: number | null;
    /** ISO time of the mark `current` was computed from. */
    markedAt: string | null;
  };
  /** Contract multiplier for the payoff (100 for US index / equity options). */
  multiplier: number;
}

/** The `today` route: every position of the tab that expires today, is closing today, or closed / expired today. */
export interface TradingToday {
  version: number;
  tab: TradingTab;
  generatedAt: string;
  /** The market day (YYYY-MM-DD) these rows are for. */
  date: string;
  /** Whether the market is open right now, so the page knows if "now" figures are moving. */
  marketOpen: boolean | null;
  spot: { symbol: string; price: number | null; asOf: string | null }[];
  rows: TradingTodayRow[];
  /** A note from the other app when some strategies cannot list positions yet. */
  note: string | null;
}

/** `status` is the HTTP status of a refused call (null when the app could not be reached, absent when this app is not configured). */
export type TradingResult<T> = { ok: true; value: T } | { ok: false; error: string; status?: number | null };

const TIMEOUT_MS = 8_000;

function readConfig(): { ok: true; baseUrl: string; token: string } | { ok: false; error: string } {
  const baseUrl = process.env.TRADING_API_URL?.trim().replace(/\/+$/, "");
  const token = process.env.TRADING_API_TOKEN?.trim();
  if (!baseUrl || !token) {
    return { ok: false, error: "The trading dashboard is not set up: TRADING_API_URL and TRADING_API_TOKEN are not both set." };
  }
  return { ok: true, baseUrl, token };
}

export function isTradingApiConfigured(): boolean {
  return readConfig().ok;
}

/** A friendly message for a non-2xx response or a network/timeout failure. */
function friendlyError(status: number | null, body: unknown): string {
  if (status === null) return "Could not reach the trading app. It may be turned off, asleep, or the tunnel may be down.";
  if (status === 503) return "The trading app's data API is not configured there yet (no token set).";
  if (status === 401) return "The trading app rejected the token. Check TRADING_API_TOKEN matches its EOD_EXCEL_API_TOKEN.";
  if (status === 429) return "Too many requests to the trading app right now. Try again in a minute.";
  if (status === 404) return "That tab was not found, or has no strategies yet.";
  const message = typeof body === "object" && body !== null && "error" in body ? String((body as { error: unknown }).error) : null;
  return message ?? `The trading app returned an unexpected response (status ${status}).`;
}

async function call<T>(path: string): Promise<TradingResult<T>> {
  const config = readConfig();
  if (!config.ok) return config;
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    console.error("Reaching the trading app failed", error);
    return { ok: false, error: friendlyError(null, null), status: null };
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  // The trading app always answers with JSON. A non-JSON error page (ngrok's "tunnel offline" 404, a gateway 502/504)
  // means the app itself could not be reached, so it counts as an outage, not as a missing tab.
  if (!response.ok && body === null) return { ok: false, error: friendlyError(null, null), status: null };
  if (!response.ok) return { ok: false, error: friendlyError(response.status, body), status: response.status };
  return { ok: true, value: body as T };
}

/** The tabs that have trading data. */
export function listTradingTabs(): Promise<TradingResult<{ version: number; tabs: TradingTab[] }>> {
  return call("/api/public/eod-excel/tabs");
}

/** One tab's KPI tiles and ranked strategies. */
export function getTradingTabData(slug: string): Promise<TradingResult<TradingTabData>> {
  return call(`/api/public/eod-excel/tab/${encodeURIComponent(slug)}/data?sections=kpi,strategies`);
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** True for a "YYYY-MM" month key. */
export function isMonthKey(value: string | null | undefined): value is string {
  return typeof value === "string" && MONTH_RE.test(value);
}

/**
 * One tab's month sheet (the `month` section). Without `month` the other app
 * answers with the current month. An unsupported section there (the other app
 * not updated yet) comes back as a 400 whose message names the supported ones;
 * that message is passed through so the page can explain.
 */
export function getTradingMonth(slug: string, month?: string | null): Promise<TradingResult<TradingTabData>> {
  const query = isMonthKey(month) ? `&month=${month}` : "";
  return call(`/api/public/eod-excel/tab/${encodeURIComponent(slug)}/data?sections=month${query}`);
}

/**
 * True when a refused call means the other app has not been given the `month`
 * section or the `today` route yet (its data API answers 400 "Unknown section"
 * for the first and its tunnel guard / router 403, 404 or 405 for the second).
 */
export function isNotBuiltYet(result: { ok: false; error: string; status?: number | null }, kind: "month" | "today"): boolean {
  if (kind === "month") return result.status === 400 && /unknown section/i.test(result.error);
  return result.status === 403 || result.status === 404 || result.status === 405;
}

/** The positions of one tab that expire, close or closed today (the `today` route; short-lived, so it may be polled). */
export function getTradingToday(slug: string): Promise<TradingResult<TradingToday>> {
  return call(`/api/public/eod-excel/tab/${encodeURIComponent(slug)}/today`);
}
