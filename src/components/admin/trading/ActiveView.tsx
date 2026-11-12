import type { TradingActive } from "@/lib/server/trading-api";
import { pnlClass, signedMoney } from "./format";
import { GroupToggle } from "./GroupToggle";
import { PositionsTable, sumPnl, ViewHeader } from "./positions";
import { TodayColumns } from "./TodayColumns";

const GROUPS_ID = "active-groups";

/**
 * "Other Active Positions": every position of one tab that is still open and
 * carries past today (so it is not in Today Expiring), grouped by strategy,
 * nearest expiry first (the `active` route). Each strategy is a collapsed
 * group whose header shows its name, position count and P&L; the page never
 * opens a group by itself, also not when it refreshes. Read-only.
 */
export function ActiveView({ data }: { data: TradingActive }) {
  const { tab } = data;
  const currency = tab.currency;
  const strategies = (data.strategies ?? []).filter((s) => (s.rows ?? []).length > 0);
  const header = <ViewHeader tab={tab} date={data.date} spot={data.spot ?? []} marketOpen={data.marketOpen ?? null} />;

  if (strategies.length === 0) {
    return (
      <div className="space-y-3">
        {header}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-700">No other active positions for {tab.label}: nothing is open that carries past today.</p>
          {data.note && <p className="mt-2 text-xs text-slate-500">{data.note}</p>}
        </div>
      </div>
    );
  }

  const allRows = strategies.flatMap((s) => s.rows);
  const total = data.totals?.pnl ?? sumPnl(allRows);

  return (
    <div className="space-y-3">
      {header}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-700">
          <span className="font-semibold text-slate-900">
            {allRows.length} open position{allRows.length === 1 ? "" : "s"}
          </span>{" "}
          in {strategies.length} strateg{strategies.length === 1 ? "y" : "ies"} ·{" "}
          <span className={`font-semibold tabular-nums ${pnlClass(total)}`}>{signedMoney(total, currency)}</span> unrealized
        </p>
        <GroupToggle targetId={GROUPS_ID} />
      </div>
      <p className="text-xs text-slate-500 md:hidden">Swipe a table sideways to see every column.</p>
      <TodayColumns>
        <div id={GROUPS_ID} className="space-y-3">
          {strategies.map((strategy) => {
            const rows = strategy.rows;
            const pnl = strategy.totals?.pnl ?? sumPnl(rows);
            return (
              <details key={strategy.slug || strategy.name} data-group className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
                <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 sm:px-6">
                  <svg
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-90"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m7 4 6 6-6 6" />
                  </svg>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-900">{strategy.name}</span>
                    <span className="block text-xs text-slate-500">
                      {rows.length} position{rows.length === 1 ? "" : "s"}
                      {strategy.underlying ? ` · ${strategy.underlying}` : ""}
                    </span>
                  </span>
                  <span className={`text-lg font-semibold tabular-nums ${pnlClass(pnl)}`}>{signedMoney(pnl, currency)}</span>
                </summary>
                <div className="px-2 pb-3 sm:px-3">
                  <PositionsTable rows={rows} tab={tab} caption={`Open positions of ${strategy.name} for ${tab.label} that carry past today`} showTotal={false} />
                </div>
              </details>
            );
          })}
        </div>
      </TodayColumns>
      {data.note && <p className="text-xs text-slate-500">{data.note}</p>}
    </div>
  );
}
