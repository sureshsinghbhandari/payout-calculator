import Link from "next/link";
import type { TradingEntrySettings, TradingEntryState, TradingOpened, TradingOpenedStrategy } from "@/lib/server/trading-api";
import { money, pnlClass, signedMoney } from "./format";
import { clockWithZone, Pill, PositionsTable, ViewHeader, zoneShort } from "./positions";
import { TodayColumns } from "./TodayColumns";

export type EntryFilter = "all" | "opened" | "not-opened";

export const ENTRY_FILTERS: { key: EntryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "opened", label: "Opened today" },
  { key: "not-opened", label: "Not opened" },
];

const STATE_LABEL: Record<TradingEntryState, { label: string; tone: "emerald" | "blue" | "amber" | "slate"; hint: string }> = {
  opened: { label: "Opened", tone: "emerald", hint: "Opened at least one position today" },
  waiting: { label: "Waiting", tone: "blue", hint: "Switched on and today is an entry day, but its entry time has not come yet" },
  skipped: { label: "Skipped", tone: "amber", hint: "Switched on and today is an entry day, its entry time has passed and nothing opened" },
  "off-day": { label: "Off day", tone: "slate", hint: "Switched on, but today is not one of its entry days" },
  disabled: { label: "Disabled", tone: "slate", hint: "Switched off" },
};

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
    active ? "border-blue-900 bg-blue-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
  }`;

/** "09:35 ET · Mon Wed Fri · 0 DTE · 2 lots · target 50% · stop 100%": the entry rule, leaving out what is not set. */
function entryRule(settings: TradingEntrySettings | null | undefined, market: string | null): string {
  if (!settings) return "";
  const parts: string[] = [];
  if (settings.entryTime) {
    const window = settings.entryWindowMinutes ? ` (+${settings.entryWindowMinutes} min)` : "";
    parts.push(`${settings.entryTime} ${zoneShort(market)}${window}`);
  }
  if (settings.entryDays && settings.entryDays.length > 0) parts.push(settings.entryDays.length === 7 ? "every day" : settings.entryDays.join(" "));
  if (settings.dteDays !== null && settings.dteDays !== undefined) parts.push(`${settings.dteDays} DTE`);
  if (settings.quantity !== null && settings.quantity !== undefined) parts.push(`${settings.quantity} lot${settings.quantity === 1 ? "" : "s"}`);
  if (settings.profitTargetPct !== null && settings.profitTargetPct !== undefined) parts.push(`target ${settings.profitTargetPct}%`);
  if (settings.stopLossPct !== null && settings.stopLossPct !== undefined) parts.push(`stop ${settings.stopLossPct}%`);
  if (settings.holdToExpiry) parts.push("hold to expiry");
  return parts.join(" · ");
}

function StrategyBlock({ strategy, data }: { strategy: TradingOpenedStrategy; data: TradingOpened }) {
  const { tab } = data;
  const rows = strategy.rows ?? [];
  const state = STATE_LABEL[strategy.state] ?? { label: String(strategy.state ?? "Unknown"), tone: "slate" as const, hint: "" };
  const rule = entryRule(strategy.settings, tab.market);
  const openCount = strategy.totals?.open ?? rows.filter((r) => r.status === "open").length;
  const closedCount = strategy.totals?.closed ?? rows.filter((r) => r.status === "closed").length;
  const lots = strategy.totals?.lots ?? null;
  const pnl = strategy.totals?.pnl ?? null;
  const earlier = strategy.earlierClosedToday;
  const last = clockWithZone(strategy.lastEntryAt, tab.market);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-900">{strategy.name}</h3>
            <Pill tone={state.tone} title={state.hint}>
              {state.label}
            </Pill>
            {strategy.underlying && <span className="text-xs text-slate-500">{strategy.underlying}</span>}
          </div>
          <p className="mt-1 text-xs text-slate-600">{rule || "Entry rule not available for this strategy."}</p>
          {typeof strategy.settings?.allocatedFunds === "number" && strategy.settings.allocatedFunds > 0 && (
            <p className="text-xs text-slate-500">Funds {money(strategy.settings.allocatedFunds, tab.currency)}</p>
          )}
        </div>
        <div className="basis-56 text-xs text-slate-700">
          {rows.length > 0 ? (
            <>
              <p>
                <span className="font-semibold text-slate-900">
                  Opened {rows.length} position{rows.length === 1 ? "" : "s"}
                </span>
                {lots !== null && <> · {lots} lot{lots === 1 ? "" : "s"}</>}
              </p>
              <p className="text-slate-500">
                {openCount} open · {closedCount} closed{last && <> · last entry {last}</>}
              </p>
            </>
          ) : (
            <p className="text-slate-500">Nothing opened today.</p>
          )}
          {strategy.carriedOpen ? <p className="text-slate-500">{strategy.carriedOpen} open from earlier days</p> : null}
          {earlier && earlier.count ? (
            <p className="text-slate-500">
              {earlier.count} earlier position{earlier.count === 1 ? "" : "s"} closed today ({signedMoney(earlier.realized, tab.currency)})
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">P/L today</div>
          <div className={`text-lg font-semibold tabular-nums ${pnlClass(pnl)}`}>{rows.length > 0 ? signedMoney(pnl, tab.currency) : "—"}</div>
        </div>
      </div>
      {rows.length === 1 && (
        // One position: shown straight away, no expand / collapse tile needed.
        <div className="border-t border-slate-100 px-2 py-3 sm:px-3">
          <PositionsTable rows={rows} tab={tab} caption={`Position ${strategy.name} opened today for ${tab.label}`} showTotal={false} />
        </div>
      )}
      {rows.length > 1 && (
        // Several positions: an expand / collapse tile (open by default).
        <details open className="border-t border-slate-100">
          <summary className="cursor-pointer px-4 py-2 text-xs font-semibold text-blue-900 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 sm:px-6">
            Positions opened today ({rows.length})
          </summary>
          <div className="px-2 pb-3 sm:px-3">
            <PositionsTable rows={rows} tab={tab} caption={`Positions ${strategy.name} opened today for ${tab.label}`} showTotal={false} />
          </div>
        </details>
      )}
    </section>
  );
}

/**
 * "Entry Board": every strategy of one tab with its entry rule, where it
 * stands today (opened, waiting, skipped, off day, disabled) and the positions
 * it opened, with their P&L (the `opened` route). A filter narrows it to the
 * strategies that opened something or that did not. Read-only.
 */
export function EntryBoardView({ data, filter, hrefFor }: { data: TradingOpened; filter: EntryFilter; hrefFor: (filter: EntryFilter) => string }) {
  const { tab } = data;
  const all = data.strategies ?? [];
  const shown = all.filter((s) => (filter === "opened" ? s.state === "opened" : filter === "not-opened" ? s.state !== "opened" : true));
  const counts = data.totals;
  const openedCount = all.filter((s) => s.state === "opened").length;
  const totalPnl = counts?.pnl ?? null;
  const positions = counts?.positions ?? all.reduce((sum, s) => sum + (s.rows?.length ?? 0), 0);

  return (
    <div className="space-y-3">
      <ViewHeader tab={tab} date={data.date} spot={data.spot ?? []} marketOpen={data.marketOpen ?? null} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700">
        <span>
          <span className="font-semibold text-slate-900">{all.length}</span> strateg{all.length === 1 ? "y" : "ies"} ·{" "}
          <span className="font-semibold text-slate-900">{openedCount}</span> opened today
          {counts?.waiting ? <> · {counts.waiting} waiting</> : null}
          {counts?.skipped ? <> · {counts.skipped} skipped</> : null}
          {counts?.offDay ? <> · {counts.offDay} off day</> : null}
          {counts?.disabled ? <> · {counts.disabled} disabled</> : null}
        </span>
        <span>
          {positions} position{positions === 1 ? "" : "s"} opened ·{" "}
          <span className={`font-semibold tabular-nums ${pnlClass(totalPnl)}`}>{positions > 0 ? signedMoney(totalPnl, tab.currency) : "—"}</span>
        </span>
        {data.clock && (
          <span className="text-xs text-slate-500">
            Market clock {data.clock.time} {zoneShort(tab.market)}
          </span>
        )}
      </div>

      <nav aria-label="Filter strategies" className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Show</span>
        {ENTRY_FILTERS.map((f) => (
          <Link key={f.key} href={hrefFor(f.key)} aria-current={f.key === filter ? "page" : undefined} className={chip(f.key === filter)}>
            {f.label}
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-700">
            {all.length === 0 ? `No strategies reported for ${tab.label}.` : "No strategy matches this filter."}
          </p>
        </div>
      ) : (
        <TodayColumns>
          <div className="space-y-3">
            {shown.map((strategy) => (
              <StrategyBlock key={strategy.slug || strategy.name} strategy={strategy} data={data} />
            ))}
          </div>
        </TodayColumns>
      )}
      {data.note && <p className="text-xs text-slate-500">{data.note}</p>}
    </div>
  );
}
