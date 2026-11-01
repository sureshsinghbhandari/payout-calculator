import type { ReactNode } from "react";
import type { TradingDistance, TradingDistanceSide, TradingLeg, TradingToday, TradingTodayRow } from "@/lib/server/trading-api";
import { AutoRefresh } from "./AutoRefresh";
import { money, number, percent, pnlClass, sheetDate, signedMoney, stepLabel } from "./format";
import { canDrawPayoff, PayoffDialog } from "./PayoffDialog";

/** "14:05" in US Eastern for an ISO timestamp; empty when it is not a date. */
const easternClock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/New_York" });

function clockTime(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "" : easternClock.format(new Date(ms));
}

/** Strikes and spots the way a trader reads them: "6850", "6852.5", "6805.12". */
function price(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? value.toLocaleString("en-US", { useGrouping: false }) : number(value, digits).replace(/,/g, "");
}

function Pill({ tone, children }: { tone: "blue" | "slate" | "amber" | "emerald"; children: ReactNode }) {
  const tones = {
    blue: "bg-blue-50 text-blue-800 ring-blue-200",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    emerald: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  } as const;
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
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

function PnlCell({ row, currency }: { row: TradingTodayRow; currency: string }) {
  const { current, maxProfit, markedAt } = row.pnl;
  const share = current !== null && maxProfit !== null && current > 0 && maxProfit > 0 ? Math.round((current / maxProfit) * 100) : null;
  const marked = clockTime(markedAt);
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

/**
 * Today's positions of one tab: every strategy position that expires today,
 * is closing today, or closed / expired today, as the other app reports them
 * (the `today` route). Read-only; refreshes itself every 30 s while the
 * market is open.
 */
export function TodayView({ data }: { data: TradingToday }) {
  const { tab, rows } = data;
  const currency = tab.currency;
  const openCount = rows.filter((r) => r.status === "open").length;
  const closedCount = rows.length - openCount;
  const total = rows.reduce<number | null>((sum, r) => (r.pnl.current === null ? sum : (sum ?? 0) + r.pnl.current), null);

  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-700">
      <span className="font-semibold text-slate-900">{tab.label}</span>
      <span aria-hidden="true">·</span>
      <span>{sheetDate(data.date)}</span>
      {data.spot.map((s) => (
        <span key={s.symbol} className="tabular-nums">
          <span aria-hidden="true">· </span>
          <span className="font-medium text-slate-900">{s.symbol}</span> {price(s.price)}
          {s.asOf && clockTime(s.asOf) && <span className="text-slate-500"> (as of {clockTime(s.asOf)})</span>}
        </span>
      ))}
      {data.marketOpen !== null && <Pill tone={data.marketOpen ? "emerald" : "slate"}>{data.marketOpen ? "Market open" : "Market closed"}</Pill>}
      <span className="ml-auto">
        <AutoRefresh seconds={30} enabled={data.marketOpen !== false} />
      </span>
    </div>
  );

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
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div
          className="relative overflow-x-auto rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
          tabIndex={0}
          role="region"
          aria-label="Today's positions, scrolls horizontally"
        >
          <table className="w-full min-w-[1080px] border-collapse text-sm">
            <caption className="sr-only">
              Positions expiring, closing or closed today for {tab.label} on {sheetDate(data.date)}
            </caption>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <th scope="col" className="px-4 py-3 text-left font-semibold sm:pl-6">
                  Strategy
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold">
                  Today&apos;s position
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold">
                  Distance now
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold">
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
                const legs = [...row.legs].sort((a, b) => b.strike - a.strike);
                const title = [row.strategy, row.underlying, row.structure].filter(Boolean).join(" · ");
                return (
                  <tr key={row.id} className="border-b border-slate-100 align-top last:border-b-0">
                    <th scope="row" className="px-4 py-3 text-left font-medium text-slate-900 sm:pl-6">
                      <div>{row.strategy}</div>
                      {(row.underlying || row.structure) && (
                        <div className="text-xs font-normal text-slate-500">{[row.underlying, row.structure].filter(Boolean).join(" · ")}</div>
                      )}
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {row.status === "open" ? (
                          <Pill tone="blue">Open</Pill>
                        ) : (
                          <Pill tone="slate">Closed{row.exitReason ? ` · ${row.exitReason}` : ""}</Pill>
                        )}
                        {row.status === "open" && row.dte === 0 && <Pill tone="amber">Expires today</Pill>}
                      </div>
                    </th>
                    <td className="px-4 py-3">
                      <ul className="space-y-0.5">
                        {legs.map((leg, i) => (
                          <LegLine key={`${leg.action}-${leg.type}-${leg.strike}-${leg.expiration ?? ""}-${i}`} leg={leg} />
                        ))}
                      </ul>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {row.quantity} lot{row.quantity === 1 ? "" : "s"} · exp {row.expiration}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <DistanceCell distance={row.distanceNow} spot={row.liveSpot} />
                    </td>
                    <td className="px-4 py-3">
                      <DistanceCell distance={row.distanceAtEntry} spot={row.entrySpot} />
                    </td>
                    <td className="px-4 py-3">
                      <PnlCell row={row} currency={currency} />
                    </td>
                    <td className="px-4 py-3 text-center sm:pr-6">
                      {canDrawPayoff(row.legs) ? (
                        <PayoffDialog
                          title={title}
                          currency={currency}
                          multiplier={row.multiplier}
                          legs={row.legs.map((leg) => ({
                            action: leg.action,
                            type: leg.type,
                            strike: leg.strike,
                            quantity: leg.quantity,
                            entryMid: leg.entryMid,
                            status: leg.status,
                          }))}
                          spot={row.liveSpot}
                          entrySpot={row.entrySpot}
                          entryCredit={row.pnl.entryCredit}
                          maxProfit={row.pnl.maxProfit}
                          maxRisk={row.pnl.maxRisk}
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
                  Total
                </th>
                <td colSpan={3} className="px-4 py-3 text-xs text-slate-600">
                  {rows.length} position{rows.length === 1 ? "" : "s"} · {openCount} open · {closedCount} closed
                </td>
                <td className={`px-4 py-3 text-right text-lg font-semibold tabular-nums ${pnlClass(total)}`}>{signedMoney(total, currency)}</td>
                <td className="sm:pr-6" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      {data.note && <p className="text-xs text-slate-500">{data.note}</p>}
    </div>
  );
}
