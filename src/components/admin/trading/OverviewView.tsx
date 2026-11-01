import type { TradingKpi, TradingStrategy, TradingTab } from "@/lib/server/trading-api";
import { formatTimestamp } from "@/lib/time";
import { money, percent, ratio, whole } from "./format";

/**
 * The Overview view of the Trading dashboard: the other app's Dashboard KPI
 * tiles and its ranked Strategy Stats rows for one tab (account). Read-only.
 */
export function OverviewView({
  data,
}: {
  data: { tab: TradingTab; generatedAt: string; asOf: string | null; kpi?: TradingKpi; strategies?: TradingStrategy[] };
}) {
  const { tab, kpi, strategies } = data;
  const m = (v: number | null) => money(v, tab.currency);

  const tiles: { label: string; value: string }[] = kpi
    ? [
        { label: "Net P&L", value: m(kpi.net) },
        { label: "Last day", value: m(kpi.lastDay) },
        { label: "This month", value: m(kpi.monthNet) },
        { label: "Last month", value: m(kpi.prevMonthNet) },
        { label: "Trade win rate", value: percent(kpi.tradeWinRate) },
        { label: "Day win rate", value: percent(kpi.dayWinRate) },
        { label: "Profit factor", value: ratio(kpi.profitFactor) },
        { label: "ROI", value: percent(kpi.roi) },
        { label: "Max drawdown", value: m(kpi.maxDd) },
        { label: "Current drawdown", value: m(kpi.currentDd) },
        { label: "Capital", value: m(kpi.capital) },
        { label: "Expectancy", value: m(kpi.expectancy) },
        { label: "Best day", value: m(kpi.bestDay) },
        { label: "Worst day", value: m(kpi.worstDay) },
        { label: "Streak (days)", value: whole(kpi.streak) },
        { label: "Charges", value: m(kpi.charges) },
        { label: "Sharpe", value: ratio(kpi.sharpe) },
        { label: "Trades", value: whole(kpi.trades) },
        { label: "Trading days", value: whole(kpi.tradingDays) },
      ]
    : [];

  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-500">
        {tab.label} · {tab.currency}
        {data.generatedAt && <> · Generated {formatTimestamp(data.generatedAt)}</>}
      </p>

      {tiles.length > 0 && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.label}</dt>
              <dd className="mt-1 break-words text-xl font-semibold tabular-nums text-slate-900 sm:text-2xl">{t.value}</dd>
            </div>
          ))}
        </dl>
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
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
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
                    <tr key={s.rank} className="border-b border-slate-100 last:border-b-0">
                      <td className="whitespace-nowrap px-4 py-3 sm:pl-6">{s.rank}</td>
                      <th scope="row" className="px-4 py-3 text-left font-medium text-slate-900">
                        {s.name}
                        {s.underlying && <span className="block text-xs font-normal text-slate-500">{s.underlying}</span>}
                      </th>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">{m(s.netPnl)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{percent(s.roi)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{percent(s.winRate)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{ratio(s.profitFactor)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{m(s.maxDrawdown?.amount ?? null)}</td>
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
