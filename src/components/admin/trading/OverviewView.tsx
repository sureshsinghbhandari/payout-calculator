import type { TradingKpi, TradingStrategy, TradingTab } from "@/lib/server/trading-api";
import { formatTimestamp } from "@/lib/time";
import { money, percent, ratio, signedMoney, whole } from "./format";

type Tone = "green" | "red" | "blue" | "amber" | "slate";

/** Tinted tile colors, as in the Excel dashboard: pale background, strong value, muted caption. */
const TONES: Record<Tone, { box: string; value: string }> = {
  green: { box: "border-emerald-200 bg-emerald-50", value: "text-emerald-700" },
  red: { box: "border-red-200 bg-red-50", value: "text-red-700" },
  blue: { box: "border-sky-200 bg-sky-50", value: "text-sky-700" },
  amber: { box: "border-amber-200 bg-amber-50", value: "text-amber-800" },
  slate: { box: "border-slate-200 bg-slate-50", value: "text-slate-900" },
};

interface Tile {
  label: string;
  value: string;
  note?: string;
  tone: Tone;
}

/** Green above zero, red below, grey at zero or unknown. */
function signTone(value: number | null | undefined): Tone {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return "slate";
  return value > 0 ? "green" : "red";
}

/** A count taken as a share of a total, e.g. 315 of 379 trades; null when either is unknown. */
function share(total: number | null, rate: number | null): number | null {
  return total === null || rate === null ? null : Math.round(total * rate);
}

function buildTiles(kpi: TradingKpi, currency: string): [Tile[], Tile[]] {
  const m = (v: number | null) => money(v, currency);
  const s = (v: number | null) => signedMoney(v, currency);

  const wins = share(kpi.trades, kpi.tradeWinRate);
  const greenDays = share(kpi.tradingDays, kpi.dayWinRate);
  const lossRatio = kpi.avgWin !== null && kpi.avgLoss ? Math.abs(kpi.avgWin / kpi.avgLoss) : null;
  const atPeak = kpi.currentDd === null || kpi.currentDd === 0;

  const top: Tile[] = [
    { label: "Net P&L (all time)", value: s(kpi.net), note: `${whole(kpi.tradingDays)} trading days`, tone: signTone(kpi.net) },
    { label: "Last trading day", value: s(kpi.lastDay), note: "most recent close", tone: signTone(kpi.lastDay) },
    { label: "This month", value: m(kpi.monthNet), note: `last month ${m(kpi.prevMonthNet)}`, tone: kpi.monthNet ? signTone(kpi.monthNet) : "slate" },
    {
      label: "Win rate (trades)",
      value: percent(kpi.tradeWinRate),
      note: wins !== null && kpi.trades !== null ? `${whole(wins)} wins / ${whole(kpi.trades - wins)} losses` : undefined,
      tone: kpi.tradeWinRate === null ? "slate" : kpi.tradeWinRate >= 0.5 ? "green" : "red",
    },
    {
      label: "Win rate (days)",
      value: percent(kpi.dayWinRate),
      note: greenDays !== null && kpi.tradingDays !== null ? `${whole(greenDays)} green / ${whole(kpi.tradingDays - greenDays)} red` : undefined,
      tone: kpi.dayWinRate === null ? "slate" : kpi.dayWinRate >= 0.5 ? "green" : "red",
    },
    {
      label: "Profit factor",
      value: ratio(kpi.profitFactor),
      note: lossRatio !== null ? `avg win / avg loss ${ratio(lossRatio)}` : undefined,
      tone: kpi.profitFactor === null ? "slate" : kpi.profitFactor >= 1 ? "green" : "red",
    },
    {
      label: "Max drawdown",
      value: m(kpi.maxDd),
      note: atPeak ? "now at equity peak" : `now ${m(kpi.currentDd)} below peak`,
      tone: "red",
    },
    { label: "ROI on capital", value: percent(kpi.roi), note: `on ${m(kpi.capital)} allocated`, tone: signTone(kpi.roi) },
  ];

  const bottom: Tile[] = [
    { label: "Trades", value: whole(kpi.trades), note: "closed trades", tone: "blue" },
    { label: "Expectancy / trade", value: s(kpi.expectancy), note: "average net P&L per trade", tone: signTone(kpi.expectancy) },
    { label: "Avg win / avg loss", value: `${m(kpi.avgWin)} / ${m(kpi.avgLoss)}`, note: "per trade", tone: "slate" },
    { label: "Best day", value: s(kpi.bestDay), tone: "green" },
    { label: "Worst day", value: s(kpi.worstDay), tone: "red" },
    {
      label: "Current streak",
      value: kpi.streak === null ? "—" : `${kpi.streak > 0 ? "+" : ""}${whole(kpi.streak)} ${Math.abs(kpi.streak) === 1 ? "day" : "days"}`,
      note: kpi.streak === null ? undefined : kpi.streak >= 0 ? "winning days in a row" : "losing days in a row",
      tone: signTone(kpi.streak),
    },
    { label: "Charges paid", value: m(kpi.charges), note: kpi.gross === null ? undefined : `gross ${m(kpi.gross)}`, tone: "amber" },
    { label: "Sharpe (daily, annualized)", value: ratio(kpi.sharpe), note: "steadiness of the daily P&L", tone: "slate" },
  ];
  return [top, bottom];
}

function TileRow({ tiles }: { tiles: Tile[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      {tiles.map((t) => (
        <div
          key={t.label}
          className={`flex min-w-0 flex-col items-center justify-center rounded-xl border px-3 py-4 text-center shadow-sm ${TONES[t.tone].box}`}
        >
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{t.label}</dt>
          <dd className={`mt-1.5 break-words text-2xl font-bold tabular-nums ${TONES[t.tone].value}`}>{t.value}</dd>
          {t.note && <p className="mt-1 text-xs italic text-slate-500">{t.note}</p>}
        </div>
      ))}
    </dl>
  );
}

/** A thin bar for a 0 to 1 share, used for win rates in the strategy table. */
function RateBar({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) return <span>—</span>;
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
        <span className={`block h-full rounded-full ${value >= 0.5 ? "bg-emerald-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="w-12 text-right">{percent(value)}</span>
    </span>
  );
}

const RANK_BADGE = ["bg-amber-100 text-amber-800", "bg-slate-200 text-slate-700", "bg-orange-100 text-orange-800"];

/**
 * The Overview view of the Trading dashboard: the other app's Dashboard KPI
 * tiles (two rows of tinted tiles, laid out like its Excel export) and its
 * ranked Strategy Stats rows for one tab (account). Read-only.
 */
export function OverviewView({
  data,
}: {
  data: { tab: TradingTab; generatedAt: string; asOf: string | null; kpi?: TradingKpi; strategies?: TradingStrategy[] };
}) {
  const { tab, kpi, strategies } = data;
  const m = (v: number | null) => money(v, tab.currency);
  const [top, bottom] = kpi ? buildTiles(kpi, tab.currency) : [[], []];

  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-500">
        {tab.label} · {tab.currency}
        {data.generatedAt && <> · Generated {formatTimestamp(data.generatedAt)}</>}
      </p>

      {kpi && (
        <div className="space-y-3">
          <TileRow tiles={top} />
          <TileRow tiles={bottom} />
        </div>
      )}

      {strategies && strategies.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Strategies</h2>
          <p className="text-xs text-slate-500 md:hidden">Swipe the table sideways to see every column.</p>
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div
              className="relative overflow-x-auto rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
              tabIndex={0}
              role="region"
              aria-label="Strategies, scrolls horizontally"
            >
              <table className="w-full min-w-[920px] border-collapse text-sm">
                <caption className="sr-only">Strategies for {tab.label}</caption>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                    <th scope="col" className="px-4 py-3 text-left font-semibold sm:pl-6">
                      Rank
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold">
                      Strategy
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">
                      Net P&amp;L
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">
                      ROI
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">
                      Win rate
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">
                      Profit factor
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">
                      Max drawdown
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold sm:pr-6">
                      Last trade
                    </th>
                  </tr>
                </thead>
                <tbody className="tabular-nums text-slate-800">
                  {strategies.map((s) => (
                    <tr key={s.rank} className="border-b border-slate-100 last:border-b-0 odd:bg-white even:bg-slate-50/60">
                      <td className="whitespace-nowrap px-4 py-3 sm:pl-6">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                            RANK_BADGE[s.rank - 1] ?? "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {s.rank}
                        </span>
                      </td>
                      <th scope="row" className="px-4 py-3 text-left font-medium text-slate-900">
                        {s.name}
                        {s.underlying && <span className="block text-xs font-normal text-slate-500">{s.underlying}</span>}
                      </th>
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${
                          s.netPnl === null || s.netPnl === 0 ? "text-slate-900" : s.netPnl > 0 ? "text-emerald-700" : "text-red-700"
                        }`}
                      >
                        {signedMoney(s.netPnl, tab.currency)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{percent(s.roi)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <RateBar value={s.winRate} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{ratio(s.profitFactor)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-red-700">{m(s.maxDrawdown?.amount ?? null)}</td>
                      <td className="whitespace-nowrap px-4 py-3 sm:pr-6">{s.lastTradeDate ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
