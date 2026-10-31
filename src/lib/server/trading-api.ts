import "server-only";

/**
 * Read-only client for the EOD trading data API of a separate app
 * (tradiersuinew, run by the owner on their own machine, reached through an
 * ngrok tunnel; see that repo's docs/eod-excel.md). Never writes anything and
 * never touches a broker; it only reads the KPI and strategy numbers that
 * app already computes for its own Excel export.
 *
 * Settings: TRADING_API_URL (the tunnel's base address, e.g.
 * "https://example.ngrok-free.app", no trailing slash) and TRADING_API_TOKEN
 * (the bearer token configured as EOD_EXCEL_API_TOKEN on the other app).
 * Both are required; without them the dashboard says so instead of guessing.
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

export interface TradingTabData {
  version: number;
  tab: TradingTab;
  generatedAt: string;
  asOf: string | null;
  sections: string[];
  kpi?: TradingKpi;
  strategies?: TradingStrategy[];
}

export type TradingResult<T> = { ok: true; value: T } | { ok: false; error: string };

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
    return { ok: false, error: friendlyError(null, null) };
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) return { ok: false, error: friendlyError(response.status, body) };
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
