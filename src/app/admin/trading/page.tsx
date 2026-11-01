import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminBreadcrumb, AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { toPublicAdmin } from "@/lib/accounts";
import { formatTimestamp } from "@/lib/time";
import { requireAdminPage } from "@/lib/server/auth";
import { getTradingTabData, isTradingApiConfigured, type TradingKpi, type TradingStrategy, type TradingTab } from "@/lib/server/trading-api";

export const metadata: Metadata = {
  title: "Trading dashboard | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

/** Only this tab is shown for now; ask to add more or make it switchable when needed. */
const DEFAULT_TAB_SLUG = "simulator";

export default function TradingDashboardPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <TradingDashboardContent />
    </Suspense>
  );
}

function money(value: number | null, currency: string): string {
  if (value === null) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
}

function percent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function ratio(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

function whole(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("en-US");
}

/**
 * Read-only view of a separate app's (tradiersuinew) end-of-day trading
 * figures, fetched over its data API (src/lib/server/trading-api.ts). This
 * page shows nothing more than that app already writes into its own Excel
 * export; it places no orders and changes nothing there. Master Admin only.
 * Shows DEFAULT_TAB_SLUG only for now (no tab picker).
 */
async function TradingDashboardContent() {
  await connection();
  const user = await requireAdminPage("trading.view");

  if (!isTradingApiConfigured()) {
    return (
      <AdminFrame user={toPublicAdmin(user)}>
        <AdminBreadcrumb items={[{ label: "Admin", href: "/admin/inquiries" }, { label: "Trading dashboard" }]} />
        <h1 className="mb-5 text-2xl font-semibold text-slate-900">Trading dashboard</h1>
        <AdminCard>
          <p className="text-sm text-slate-700">
            This is not set up yet. It reads trading results from a separate app on your own machine, over its data
            API (see that app&apos;s <code className="rounded bg-slate-100 px-1">docs/eod-excel.md</code>). Add two
            settings in Vercel, then redeploy:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-6 text-sm text-slate-700">
            <li>
              <code className="rounded bg-slate-100 px-1">TRADING_API_URL</code> — that app&apos;s address, e.g. its
              ngrok tunnel (no trailing slash).
            </li>
            <li>
              <code className="rounded bg-slate-100 px-1">TRADING_API_TOKEN</code> — the same value as{" "}
              <code className="rounded bg-slate-100 px-1">EOD_EXCEL_API_TOKEN</code> set there.
            </li>
          </ul>
          <p className="mt-3 text-sm text-slate-600">
            That other app, and its ngrok tunnel, also need to be running whenever this page is opened.
          </p>
        </AdminCard>
      </AdminFrame>
    );
  }

  const dataResult = await getTradingTabData(DEFAULT_TAB_SLUG);

  return (
    <AdminFrame user={toPublicAdmin(user)}>
      <AdminBreadcrumb items={[{ label: "Admin", href: "/admin/inquiries" }, { label: "Trading dashboard" }]} />
      <h1 className="text-2xl font-semibold text-slate-900">Trading dashboard</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        Read-only figures from a separate trading app on your own machine — the same numbers as its end-of-day Excel
        export. Nothing here places an order or changes anything there.
      </p>

      <div className="mt-5">
        {!dataResult.ok ? (
          <AdminCard>
            <p role="alert" className="text-sm font-medium text-red-700">
              {dataResult.error}
            </p>
          </AdminCard>
        ) : (
          <TradingTabView data={dataResult.value} />
        )}
      </div>
    </AdminFrame>
  );
}

function TradingTabView({
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.label}</dt>
              <dd className="mt-1 break-words text-xl font-semibold tabular-nums text-slate-900 sm:text-2xl">{t.value}</dd>
            </div>
          ))}
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
