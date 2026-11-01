import Link from "next/link";
import type { TradingMonth, TradingTab } from "@/lib/server/trading-api";
import { money, monthShort, monthTitle, percent, pnlClass, sheetDate, whole } from "./format";

/**
 * One month of trading results laid out like the Excel month sheet of the
 * other app ("October 2026"): a title bar, the summary rows (Returns, Capital
 * Reqd, ROI%, Underlying, Profit Days, Loss Days) per strategy column plus a
 * TOTAL column, then one row per trading day with a heat colour per strategy
 * cell, the day's TOTAL and the running CUMULATIVE. Above it, previous / next
 * month arrows and a pill list of every month that has a sheet.
 *
 * Server component: it only formats the figures the other app already
 * computed; `hrefFor` is how the page builds the link to another month.
 */

/** Header fill per strategy column, cycled by index (full class names so Tailwind keeps them). */
const STRATEGY_FILLS = [
  "bg-blue-600",
  "bg-emerald-600",
  "bg-violet-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-cyan-600",
  "bg-indigo-600",
  "bg-lime-700",
  "bg-fuchsia-600",
  "bg-orange-600",
  "bg-teal-600",
  "bg-sky-600",
  "bg-purple-600",
  "bg-pink-600",
];

const NAVY = "bg-[#1F3864] text-white";
const SUMMARY_CELL = "bg-[#F1F5F9] px-3 py-1.5 text-center font-semibold tabular-nums";
const LABEL_CELL = `sticky left-0 z-10 whitespace-nowrap px-3 py-1.5 text-left font-semibold ${NAVY}`;

/** Cell fill for a day's strategy figure: green / red shades by magnitude relative to the sheet's largest figure. */
function heatClass(value: number, maxAbs: number): string {
  if (!Number.isFinite(value) || value === 0 || maxAbs <= 0) return "bg-white text-slate-400";
  const strength = Math.min(1, Math.abs(value) / maxAbs);
  if (value > 0) {
    if (strength > 0.66) return "bg-emerald-300 text-emerald-950";
    if (strength > 0.33) return "bg-emerald-200 text-emerald-900";
    return "bg-emerald-100 text-emerald-900";
  }
  if (strength > 0.66) return "bg-red-300 text-red-950";
  if (strength > 0.33) return "bg-red-200 text-red-900";
  return "bg-red-100 text-red-900";
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="size-5">
      {direction === "left" ? <path d="M12.5 5 7.5 10l5 5" strokeLinecap="round" strokeLinejoin="round" /> : <path d="m7.5 5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

const ARROW_BASE = "inline-flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm";
const ARROW_LINK = `${ARROW_BASE} text-slate-700 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700`;
const ARROW_DISABLED = `${ARROW_BASE} cursor-not-allowed text-slate-300`;

function MonthArrow({ href, label, direction }: { href: string | null; label: string; direction: "left" | "right" }) {
  if (!href) {
    return (
      <span aria-disabled="true" title={label} className={ARROW_DISABLED}>
        <Chevron direction={direction} />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} title={label} className={ARROW_LINK}>
      <Chevron direction={direction} />
    </Link>
  );
}

export function MonthSheet({ month, tab, hrefFor }: { month: TradingMonth; tab: TradingTab; hrefFor: (monthKey: string) => string }) {
  const { columns, days, summary } = month;
  const title = monthTitle(month.month);
  const available = month.available.length > 0 ? month.available : [month.month];

  // `available` is newest first; month keys sort as text, so the nearest older /
  // newer month can be found even when the current month is not in the list.
  const older = available.find((key) => key < month.month) ?? null;
  const newer = [...available].reverse().find((key) => key > month.month) ?? null;

  const maxAbs = days.reduce((max, day) => day.values.reduce((m, v) => (Number.isFinite(v) ? Math.max(m, Math.abs(v)) : m), max), 0);
  const columnCount = columns.length + 3; // DATE + strategies + TOTAL + CUMULATIVE
  const m = (value: number | null | undefined) => money(value, tab.currency);

  return (
    <div className="space-y-3">
      <nav aria-label="Month" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <MonthArrow href={older ? hrefFor(older) : null} label={older ? `Previous month, ${monthTitle(older)}` : "No earlier month"} direction="left" />
          <h2 className="text-center text-lg font-bold text-slate-900">{title}</h2>
          <MonthArrow href={newer ? hrefFor(newer) : null} label={newer ? `Next month, ${monthTitle(newer)}` : "No later month"} direction="right" />
        </div>
        {available.length > 1 && (
          <ul className="hidden flex-wrap justify-center gap-1.5 sm:flex" aria-label="All months">
            {available.map((key) =>
              key === month.month ? (
                <li key={key}>
                  <span aria-current="page" className="inline-block rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                    {monthShort(key)}
                  </span>
                </li>
              ) : (
                <li key={key}>
                  <Link
                    href={hrefFor(key)}
                    className="inline-block rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                  >
                    {monthShort(key)}
                  </Link>
                </li>
              ),
            )}
          </ul>
        )}
      </nav>

      <p className="text-xs text-slate-500 md:hidden">Swipe the table sideways to see every column.</p>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className={`rounded-t-2xl px-4 py-2.5 text-sm font-bold sm:px-6 ${NAVY}`}>
          Performance Summary - {tab.label} ({title})
        </div>
        <div
          className="relative max-h-[75vh] overflow-auto rounded-b-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
          tabIndex={0}
          role="region"
          aria-label="Month sheet, scrolls horizontally"
        >
          <table className="w-full min-w-max border-collapse text-sm text-slate-800">
            <caption className="sr-only">
              {tab.label} results for {title}, one column per strategy, in {tab.currency}
            </caption>
            <thead>
              <tr className="border-b border-slate-200">
                <th scope="row" className={LABEL_CELL}>
                  Returns
                </th>
                {summary.returns.map((value, i) => (
                  <td key={columns[i]?.name ?? i} className={`${SUMMARY_CELL} ${value < 0 ? "text-red-700" : "text-slate-900"}`}>
                    {m(value)}
                  </td>
                ))}
                <td className={`${SUMMARY_CELL} ${summary.total.returns < 0 ? "text-red-700" : "text-slate-900"}`}>{m(summary.total.returns)}</td>
                <td className="bg-[#F1F5F9]" />
              </tr>
              <tr className="border-b border-slate-200">
                <th scope="row" className={LABEL_CELL}>
                  Capital Reqd
                </th>
                {summary.capital.map((value, i) => (
                  <td key={columns[i]?.name ?? i} className={`${SUMMARY_CELL} text-slate-900`}>
                    {value === null ? "" : m(value)}
                  </td>
                ))}
                <td className={`${SUMMARY_CELL} text-slate-900`}>{summary.total.capital === null ? "" : m(summary.total.capital)}</td>
                <td className="bg-[#F1F5F9]" />
              </tr>
              <tr className="border-b border-slate-200">
                <th scope="row" className={LABEL_CELL}>
                  ROI%
                </th>
                {summary.roi.map((value, i) => (
                  <td key={columns[i]?.name ?? i} className={`${SUMMARY_CELL} ${value !== null && value < 0 ? "text-red-700" : "text-slate-900"}`}>
                    {value === null ? "" : percent(value, 2)}
                  </td>
                ))}
                <td className={`${SUMMARY_CELL} ${summary.total.roi !== null && summary.total.roi < 0 ? "text-red-700" : "text-slate-900"}`}>
                  {summary.total.roi === null ? "" : percent(summary.total.roi, 2)}
                </td>
                <td className="bg-[#F1F5F9]" />
              </tr>
              <tr className="border-b border-slate-200">
                <td colSpan={columnCount} className="bg-white px-3 py-1.5 text-left text-xs italic text-slate-600">
                  All figures in {tab.currency}, net of broker charges; each day is the trades closed that day. Capital Reqd is the
                  strategy&apos;s Funds allocated.
                </td>
              </tr>
              <tr className="border-b border-slate-200">
                <th scope="row" className={LABEL_CELL}>
                  Underlying
                </th>
                {columns.map((column) => (
                  <td key={column.name} className="bg-sky-100 px-3 py-1.5 text-center font-semibold text-slate-900">
                    {column.underlying ?? ""}
                  </td>
                ))}
                <td className="bg-[#F1F5F9]" />
                <td className="bg-[#F1F5F9]" />
              </tr>
              <tr className="border-b border-slate-200">
                <th scope="row" className={LABEL_CELL}>
                  Profit Days
                </th>
                {summary.profitDays.map((value, i) => (
                  <td key={columns[i]?.name ?? i} className={`${SUMMARY_CELL} text-slate-900`}>
                    {whole(value)}
                  </td>
                ))}
                <td className={`${SUMMARY_CELL} text-slate-900`}>{whole(summary.total.profitDays)}</td>
                <td className="bg-[#F1F5F9]" />
              </tr>
              <tr className="border-b-2 border-slate-300">
                <th scope="row" className={LABEL_CELL}>
                  Loss Days
                </th>
                {summary.lossDays.map((value, i) => (
                  <td key={columns[i]?.name ?? i} className={`${SUMMARY_CELL} text-slate-900`}>
                    {whole(value)}
                  </td>
                ))}
                <td className={`${SUMMARY_CELL} text-slate-900`}>{whole(summary.total.lossDays)}</td>
                <td className="bg-[#F1F5F9]" />
              </tr>
              <tr>
                <th scope="col" className={`sticky left-0 top-0 z-30 whitespace-nowrap px-3 py-2 text-left text-xs font-bold uppercase tracking-wide ${NAVY}`}>
                  Date
                </th>
                {columns.map((column, i) => (
                  <th
                    key={column.name}
                    scope="col"
                    className={`sticky top-0 z-20 whitespace-nowrap px-3 py-2 text-center text-xs font-bold text-white ${STRATEGY_FILLS[i % STRATEGY_FILLS.length]}`}
                  >
                    {column.name}
                  </th>
                ))}
                <th scope="col" className={`sticky top-0 z-20 whitespace-nowrap px-3 py-2 text-center text-xs font-bold uppercase tracking-wide ${NAVY}`}>
                  Total
                </th>
                <th scope="col" className="sticky top-0 z-20 whitespace-nowrap bg-teal-600 px-3 py-2 text-center text-xs font-bold uppercase tracking-wide text-white">
                  Cumulative
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {days.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="px-4 py-8 text-center text-sm text-slate-600">
                    No closed trades in {title} yet.
                  </td>
                </tr>
              ) : (
                days.map((day) => (
                  <tr key={day.date} className="border-b border-slate-100 last:border-b-0">
                    <th scope="row" className="sticky left-0 z-10 whitespace-nowrap border-r border-slate-200 bg-white px-3 py-1.5 text-left font-bold text-slate-900">
                      {sheetDate(day.date)}
                    </th>
                    {columns.map((column, i) => {
                      const value = day.values[i] ?? 0;
                      return (
                        <td key={column.name} className={`whitespace-nowrap px-3 py-1.5 text-center ${heatClass(value, maxAbs)}`}>
                          {m(value)}
                        </td>
                      );
                    })}
                    <td className={`whitespace-nowrap bg-white px-3 py-1.5 text-center font-bold ${pnlClass(day.total)}`}>{m(day.total)}</td>
                    <td className={`whitespace-nowrap bg-white px-3 py-1.5 text-center font-semibold ${pnlClass(day.cumulative)}`}>
                      {m(day.cumulative)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
