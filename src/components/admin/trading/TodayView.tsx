import type { TradingToday } from "@/lib/server/trading-api";
import { sheetDate } from "./format";
import { PositionsTable, ViewHeader } from "./positions";
import { TodayColumns } from "./TodayColumns";

/**
 * "Today Expiring": every strategy position of one tab that expires today,
 * is closing today, or closed / expired today, as the other app reports them
 * (the `today` route). Read-only; refreshes itself every 30 s while the
 * market is open. The position legs, distance now and distance at entry
 * columns are hidden until chosen in the settings menu (TodayColumns).
 */
export function TodayView({ data }: { data: TradingToday }) {
  const { tab } = data;
  const rows = data.rows ?? [];
  const header = <ViewHeader tab={tab} date={data.date} spot={data.spot ?? []} marketOpen={data.marketOpen ?? null} />;

  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        {header}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-700">Nothing expiring or closing today for {tab.label}.</p>
          {data.note && <p className="mt-2 text-xs text-slate-500">{data.note}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {header}
      <p className="text-xs text-slate-500 md:hidden">Swipe the table sideways to see every column.</p>
      <TodayColumns>
        <PositionsTable rows={rows} tab={tab} caption={`Positions expiring, closing or closed today for ${tab.label} on ${sheetDate(data.date)}`} />
      </TodayColumns>
      {data.note && <p className="text-xs text-slate-500">{data.note}</p>}
    </div>
  );
}
