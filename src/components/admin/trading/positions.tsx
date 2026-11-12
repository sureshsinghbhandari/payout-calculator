import type { ReactNode } from "react";
import type {
  TradingDistance,
  TradingDistanceSide,
  TradingLeg,
  TradingSpot,
  TradingTab,
  TradingTodayRow,
} from "@/lib/server/trading-api";
import { AutoRefresh } from "./AutoRefresh";
import { money, number, percent, pnlClass, sheetDate, signedMoney, stepLabel } from "./format";
import { PayoffDialog } from "./PayoffDialog";
import { canDrawPayoff } from "./payoff-legs";

/**
 * The parts shared by the three position views of the Trading dashboard (Today Expiring, Entry Board, Other
 * Active Positions): the header, and the table of positions with its leg, distance and P&L cells. Server
 * components; the optional columns are hidden by TodayColumns, which wraps the table(s).
 */

/** Classes that hide a cell while TodayColumns lists its column in `data-hide` (written out in full so Tailwind keeps them). */
const HIDE_POSITION = "[[data-hide~=position]_&]:hidden";
const HIDE_NOW = "[[data-hide~=now]_&]:hidden";
const HIDE_ENTRY = "[[data-hide~=entry]_&]:hidden";

/** The time zone a tab's times are in: US tabs show Eastern time, India tabs India time. */
export function marketZone(market: string | null | undefined): string {
  return market === "INDIA" ? "Asia/Kolkata" : "America/New_York";
}

/** "ET" / "IST", the short name used next to a time. */
export function zoneShort(market: string | null | undefined): string {
  return market === "INDIA" ? "IST" : "ET";
}

const clockFormatters = new Map<string, Intl.DateTimeFormat>();

/** "14:05" in the tab's market time zone for an ISO timestamp; empty when it is not a date. */
export function clockTime(iso: string | null | undefined, market?: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const zone = marketZone(market);
  let formatter = clockFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zone });
    clockFormatters.set(zone, formatter);
  }
  return formatter.format(new Date(ms));
}

/** "14:05 ET" / "14:05 IST": the clock time with the zone it is in; empty when it is not a date. */
export function clockWithZone(iso: string | null | undefined, market?: string | null): string {
  const time = clockTime(iso, market);
  return time ? `${time} ${zoneShort(market)}` : "";
}

/** Strikes and spots the way a trader reads them: "6850", "6852.5", "6805.12". */
export function price(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? value.toLocaleString("en-US", { useGrouping: false }) : number(value, digits).replace(/,/g, "");
}

export function Pill({ tone, children, title }: { tone: "blue" | "slate" | "amber" | "emerald" | "red"; children: ReactNode; title?: string }) {
  const tones = {
    blue: "bg-blue-50 text-blue-800 ring-blue-200",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    emerald: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    red: "bg-red-50 text-red-800 ring-red-200",
  } as const;
  return (
    <span title={title} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tones[tone]}`}>
      {children}
    </span>
  );
}

function LegLine({ leg }: { leg: TradingLeg }) {
  const closed = leg.status === "closed";
  return (
    <li className={`flex items-baseline gap-2 whitespace-nowrap font-mono text-xs tabular-nums ${closed ? "text-slate-400 line-through" : "text-slate-800"}`}>
      <span className={`w-3 font-bold ${closed ? "" : leg.action === "sell" ? "text-red-700" : "text-emerald-700"}`}>{leg.action === "sell" ? "S" : "B"}</span>
      <span className="w-16 text-right">{price(leg.strike)}</span>
      <span className="w-3">{leg.type === "call" ? "C" : "P"}</span>
      <span className="text-slate-500">×{leg.quantity}</span>
      {leg.entryMid !== null && Number.isFinite(leg.entryMid) && <span className="text-slate-400">@ {number(leg.entryMid, 2)}</span>}
    </li>
  );
}

function DistanceSide({ label, side }: { label: "P" | "C"; side: TradingDistanceSide | null | undefined }) {
  const step = side ? stepLabel(side.steps) : null;
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap tabular-nums">
      <span className={`w-3 font-semibold ${label === "P" ? "text-red-700" : "text-emerald-700"}`}>{label}</span>
      {side ? (
        <>
          <span>{number(side.points, 1)}</span>
          <span className="text-slate-500">({percent(side.pct / 100, 2)})</span>
          {step && <span className="font-semibold text-slate-500">{step}</span>}
          {side.breached && <span className="rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-800">ITM</span>}
        </>
      ) : (
        <span className="text-slate-400">—</span>
      )}
    </div>
  );
}

function DistanceCell({ distance, spot }: { distance: TradingDistance | null; spot: number | null }) {
  return (
    <div className="space-y-0.5 text-xs">
      {distance ? (
        <>
          <DistanceSide label="P" side={distance.put} />
          <DistanceSide label="C" side={distance.call} />
        </>
      ) : (
        <div className="text-slate-400">—</div>
      )}
      <div className="pt-0.5 text-[11px] text-slate-500">spot {price(spot)}</div>
    </div>
  );
}

function PnlCell({ row, currency, market }: { row: TradingTodayRow; currency: string; market: string | null }) {
  const { current = null, maxProfit = null, markedAt = null } = row.pnl ?? {};
  const share = current !== null && maxProfit !== null && current > 0 && maxProfit > 0 ? Math.round((current / maxProfit) * 100) : null;
  const marked = clockWithZone(markedAt, market);
  return (
    <div className="text-right">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{row.status === "closed" ? "Realized" : "Unrealized"}</div>
      <div className={`text-lg font-semibold tabular-nums ${pnlClass(current)}`}>{signedMoney(current, currency)}</div>
      <div className="text-[11px] text-slate-500">
        {maxProfit !== null && Number.isFinite(maxProfit) ? (
          <>
            of max {money(maxProfit, currency)}
            {share !== null && <> · {share}%</>}
          </>
        ) : (
          "max unknown"
        )}
        {marked && <> · at {marked}</>}
      </div>
    </div>
  );
}

/** The sum of the rows' current P&L; null when no row has one (shown as a dash, never as 0). */
export function sumPnl(rows: { pnl: { current: number | null } }[]): number | null {
  return rows.reduce<number | null>((sum, r) => (r.pnl?.current == null ? sum : (sum ?? 0) + r.pnl.current), null);
}

/** The line above a position view: account, market day, spot prices, market status and the refresh note. */
export function ViewHeader({
  tab,
  date,
  spot,
  marketOpen,
}: {
  tab: TradingTab;
  date: string;
  spot: TradingSpot[];
  marketOpen: boolean | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-700">
      <span className="font-semibold text-slate-900">{tab.label}</span>
      <span aria-hidden="true">·</span>
      <span>{sheetDate(date)}</span>
      {spot.map((s) => (
        <span key={s.symbol} className="tabular-nums">
          <span aria-hidden="true">· </span>
          <span className="font-medium text-slate-900">{s.symbol}</span> {price(s.price)}
          {s.asOf && clockWithZone(s.asOf, tab.market) && <span className="text-slate-500"> (as of {clockWithZone(s.asOf, tab.market)})</span>}
        </span>
      ))}
      {marketOpen !== null && <Pill tone={marketOpen ? "emerald" : "slate"}>{marketOpen ? "Market open" : "Market closed"}</Pill>}
      <span className="ml-auto">
        {/* Figures are cached about 10 s by the trading app: never poll faster than 30 s, and stop when the market is closed. */}
        <AutoRefresh seconds={30} enabled={marketOpen !== false} />
      </span>
    </div>
  );
}

/**
 * A table of positions with the Payoff button and a total row. Used for Today Expiring (all rows), for the
 * positions a strategy opened (Entry Board) and for one strategy's group in Other Active Positions.
 */
export function PositionsTable({
  rows,
  tab,
  caption,
  totalLabel = "Total",
}: {
  rows: TradingTodayRow[];
  tab: TradingTab;
  caption: string;
  totalLabel?: string;
}) {
  const currency = tab.currency;
  const openCount = rows.filter((r) => r.status === "open").length;
  const closedCount = rows.length - openCount;
  const total = sumPnl(rows);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div
        className="relative overflow-x-auto rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
        tabIndex={0}
        role="region"
        aria-label={`${caption}, scrolls horizontally`}
      >
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <th scope="col" className="px-4 py-3 text-left font-semibold sm:pl-6">
                Strategy
              </th>
              <th scope="col" className={`px-4 py-3 text-left font-semibold ${HIDE_POSITION}`}>
                Position
              </th>
              <th scope="col" className={`px-4 py-3 text-left font-semibold ${HIDE_NOW}`}>
                Distance now
              </th>
              <th scope="col" className={`px-4 py-3 text-left font-semibold ${HIDE_ENTRY}`}>
                Distance at entry
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Current P/L
              </th>
              <th scope="col" className="px-4 py-3 text-center font-semibold sm:pr-6">
                Payoff
              </th>
            </tr>
          </thead>
          <tbody className="text-slate-800">
            {rows.map((row) => {
              const legs = [...(row.legs ?? [])].sort((a, b) => b.strike - a.strike);
              return (
                <tr key={row.id} className="border-b border-slate-100 align-top last:border-b-0">
                  <th scope="row" className="px-4 py-3 text-left font-medium text-slate-900 sm:pl-6">
                    <div>{row.strategy}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {row.status === "open" ? <Pill tone="blue">Open</Pill> : <Pill tone="slate">Closed{row.exitReason ? ` · ${row.exitReason}` : ""}</Pill>}
                      {row.status === "open" && row.dte === 0 && <Pill tone="amber">Expires today</Pill>}
                      {row.status === "open" && row.dte !== null && row.dte > 0 && (
                        <Pill tone="slate">{row.dte} DTE</Pill>
                      )}
                    </div>
                  </th>
                  <td className={`px-4 py-3 ${HIDE_POSITION}`}>
                    <ul className="space-y-0.5">
                      {legs.map((leg, i) => (
                        <LegLine key={`${leg.action}-${leg.type}-${leg.strike}-${leg.expiration ?? ""}-${i}`} leg={leg} />
                      ))}
                    </ul>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {row.quantity} lot{row.quantity === 1 ? "" : "s"} · exp {row.expiration}
                      {row.structure && <> · {row.structure}</>}
                    </div>
                  </td>
                  <td className={`px-4 py-3 ${HIDE_NOW}`}>
                    <DistanceCell distance={row.distanceNow} spot={row.liveSpot} />
                  </td>
                  <td className={`px-4 py-3 ${HIDE_ENTRY}`}>
                    <DistanceCell distance={row.distanceAtEntry} spot={row.entrySpot} />
                  </td>
                  <td className="px-4 py-3">
                    <PnlCell row={row} currency={currency} market={tab.market} />
                  </td>
                  <td className="px-4 py-3 text-center sm:pr-6">
                    {canDrawPayoff(row.legs ?? []) ? (
                      <PayoffDialog
                        title={row.strategy}
                        currency={currency}
                        multiplier={row.multiplier}
                        legs={(row.legs ?? []).map((leg) => ({
                          action: leg.action,
                          type: leg.type,
                          strike: leg.strike,
                          quantity: leg.quantity,
                          entryMid: leg.entryMid,
                          status: leg.status,
                        }))}
                        spot={row.liveSpot}
                        entrySpot={row.entrySpot}
                        entryCredit={row.pnl?.entryCredit ?? null}
                        maxProfit={row.pnl?.maxProfit ?? null}
                        maxRisk={row.pnl?.maxRisk ?? null}
                      />
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50 text-sm">
              <th scope="row" className="px-4 py-3 text-left font-semibold text-slate-900 sm:pl-6">
                {totalLabel}
                <span className="block text-xs font-normal text-slate-600">
                  {rows.length} position{rows.length === 1 ? "" : "s"} · {openCount} open · {closedCount} closed
                </span>
              </th>
              <td className={HIDE_POSITION} />
              <td className={HIDE_NOW} />
              <td className={HIDE_ENTRY} />
              <td className={`px-4 py-3 text-right text-lg font-semibold tabular-nums ${pnlClass(total)}`}>{signedMoney(total, currency)}</td>
              <td className="sm:pr-6" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
