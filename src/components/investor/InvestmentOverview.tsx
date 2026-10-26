import "server-only";
import type { Investment } from "@/lib/accounts";
import { formatCents, formatDollars, formatIsoDate, formatIsoDateLong, formatYears } from "@/lib/format";
import { calculatePayoutSchedule, FREQUENCY_LABELS, PAYOUT_TYPE_LABELS, type PayoutSchedule } from "@/lib/payout";

/**
 * One investment in the investor portal: summary and full payout schedule.
 *
 * Server-only on purpose: the investment carries its interest rate, which is
 * used for the calculation but must never reach the investor's browser. Only
 * the rendered amounts and dates are sent; never pass the investment or the
 * schedule (whose inputs include the rate) to a client component.
 */

const MONTHS_LABEL: Record<number, string> = { 4: "3 months", 2: "6 months", 1: "12 months" };

function scheduleFor(investment: Investment): PayoutSchedule | null {
  try {
    return calculatePayoutSchedule({
      principal: investment.principal,
      annualRatePercent: investment.annualRatePercent,
      lockInYears: investment.lockInYears,
      payoutType: investment.payoutType,
      frequency: investment.frequency,
      investmentDate: investment.investmentDate,
    });
  } catch (error) {
    console.error(`Payout schedule for investment ${investment.id} could not be calculated`, error);
    return null;
  }
}

interface Props {
  investment: Investment;
  /** Today's date in UTC, YYYY-MM-DD. Payouts on or before it count as paid. */
  today: string;
}

export function InvestmentOverview({ investment, today }: Props) {
  const headingId = `investment-${investment.id}-heading`;
  const title = `${formatDollars(investment.principal)} investment`;
  const schedule = scheduleFor(investment);

  if (!schedule) {
    return (
      <section aria-labelledby={headingId} className="space-y-3">
        <h2 id={headingId} className="text-xl font-semibold text-slate-900 sm:text-2xl">
          {title}
        </h2>
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          The payout schedule for this investment could not be shown. Please contact us and we will help.
        </p>
      </section>
    );
  }

  const { rows, totals, startDate, periodsPerYear } = schedule;
  const next = rows.find((row) => row.payoutDate > today) ?? null;
  const paidCount = rows.filter((row) => row.payoutDate <= today).length;

  const details = [
    { label: "Investment amount", value: formatDollars(investment.principal) },
    { label: "Planned investment date", value: formatIsoDate(investment.investmentDate) },
    { label: "Interest starts", value: formatIsoDate(startDate) },
    { label: "Term locked", value: formatYears(investment.lockInYears) },
    { label: "Payout term", value: FREQUENCY_LABELS[investment.frequency] },
    { label: "Payout type", value: PAYOUT_TYPE_LABELS[investment.payoutType] },
  ];

  return (
    <section aria-labelledby={headingId} className="space-y-6">
      <div>
        <h2 id={headingId} className="text-xl font-semibold text-slate-900 sm:text-2xl">
          {title}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {rows.length} {rows.length === 1 ? "payout" : "payouts"}, {paidCount} paid. Interest starts{" "}
          {formatIsoDateLong(startDate)}.
        </p>
      </div>

      {/* Summary */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-px bg-slate-200 sm:grid-cols-3">
          <div className="bg-white p-5">
            <p className="text-sm text-slate-600">Next payout</p>
            {next ? (
              <>
                <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
                  {formatCents(next.totalPayoutCents)}
                </p>
                <p className="mt-0.5 text-sm text-slate-600">on {formatIsoDateLong(next.payoutDate)}</p>
              </>
            ) : (
              <p className="mt-1 text-lg font-semibold text-emerald-800">All payouts completed</p>
            )}
          </div>
          <div className="bg-white p-5">
            <p className="text-sm text-slate-600">Total interest</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
              {formatCents(totals.interestCents)}
            </p>
            <p className="mt-0.5 text-sm text-slate-600">Over the full term</p>
          </div>
          <div className="bg-blue-900 p-5 text-white">
            <p className="text-sm text-blue-100">Total amount paid</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-white">
              {formatCents(totals.payoutCents)}
            </p>
            <p className="mt-0.5 text-sm text-blue-100">Interest and principal over the full term</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-slate-200 p-5 sm:grid-cols-3">
          {details.map((item) => (
            <div key={item.label}>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{item.label}</dt>
              <dd className="mt-1 text-base font-semibold text-slate-900">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Schedule table */}
      <div className="space-y-2">
        <p className="text-xs text-slate-500 md:hidden">Swipe the table sideways to see every column.</p>
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div
            className="relative overflow-x-auto rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
            tabIndex={0}
            role="region"
            aria-label={`Payout schedule for the ${title}, scrolls horizontally`}
          >
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <caption className="sr-only">
                Payout schedule for your {title}, all amounts in US dollars
              </caption>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    Payout No.
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    Payout Date
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    Opening Principal
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    Interest Amount
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    Principal Repayment
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    Total Payout
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    Remaining Principal
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums text-slate-800">
                {rows.map((row, index) => {
                  const paid = row.payoutDate <= today;
                  const isNext = next?.payoutNumber === row.payoutNumber;
                  const rowClass = isNext ? "bg-blue-50/70" : index % 2 === 1 ? "bg-slate-50/60" : "";
                  return (
                    <tr key={row.payoutNumber} className={`border-b border-slate-100 ${rowClass}`}>
                      <th scope="row" className="px-4 py-3 text-left font-medium text-slate-900">
                        {row.payoutNumber}
                      </th>
                      <td className="whitespace-nowrap px-4 py-3">{formatIsoDate(row.payoutDate)}</td>
                      <td className="px-4 py-3 text-right">{formatCents(row.openingPrincipalCents)}</td>
                      <td className="px-4 py-3 text-right">{formatCents(row.interestCents)}</td>
                      <td className="px-4 py-3 text-right">{formatCents(row.principalRepaymentCents)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
                        {formatCents(row.totalPayoutCents)}
                      </td>
                      <td className="px-4 py-3 text-right">{formatCents(row.remainingPrincipalCents)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            paid
                              ? "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200"
                              : "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200"
                          }`}
                        >
                          {paid ? "Paid" : "Upcoming"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="tabular-nums">
                <tr className="border-t-2 border-blue-900 bg-blue-50 font-semibold text-blue-950">
                  <th scope="row" colSpan={3} className="px-4 py-3 text-left">
                    Total
                  </th>
                  <td className="px-4 py-3 text-right">{formatCents(totals.interestCents)}</td>
                  <td className="px-4 py-3 text-right">{formatCents(totals.principalCents)}</td>
                  <td className="px-4 py-3 text-right">{formatCents(totals.payoutCents)}</td>
                  <td className="px-4 py-3 text-right">{formatCents(rows.at(-1)?.remainingPrincipalCents ?? 0)}</td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-slate-500">
          Statuses are based on the scheduled payout dates: a payout shows as Paid from its scheduled date (UTC), not
          when a payment is confirmed. Payouts fall every {MONTHS_LABEL[periodsPerYear] ?? "period"} from the interest
          start date and are not moved for weekends.
        </p>
      </div>
    </section>
  );
}
