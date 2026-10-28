import "server-only";
import { investorStatementAction } from "@/app/portal/actions";
import { StatementButton } from "@/components/StatementButton";
import type { Investment } from "@/lib/accounts";
import { formatCents, formatDollars, formatIsoDate, formatIsoDateLong, formatYears } from "@/lib/format";
import {
  maturityDate,
  PAYOUT_STATUS_BADGES,
  PAYOUT_STATUS_LABELS,
  payoutsWithStatus,
  scheduleOrNull,
} from "@/lib/investments";
import { FREQUENCY_LABELS, PAYOUT_TYPE_LABELS } from "@/lib/payout";

/**
 * One investment in the investor portal: summary and full payout schedule.
 *
 * Server-only on purpose: the investment carries its interest rate, which is
 * used for the calculation but must never reach the investor's browser. Only
 * the rendered amounts and dates are sent; never pass the investment or the
 * schedule (whose inputs include the rate) to a client component. The
 * statement download gets only a server action bound to the investment id.
 */

const MONTHS_LABEL: Record<number, string> = { 4: "3 months", 2: "6 months", 1: "12 months" };

interface Props {
  investment: Investment;
  /** Today's date in Eastern Time, YYYY-MM-DD. Unrecorded payouts on or before it are Due. */
  today: string;
}

export function InvestmentOverview({ investment, today }: Props) {
  const headingId = `investment-${investment.id}-heading`;
  const title = `${formatDollars(investment.principal)} investment`;
  const schedule = scheduleOrNull(investment);

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

  const { totals, startDate, periodsPerYear } = schedule;
  const rows = payoutsWithStatus(investment, schedule, today);
  // The first payout not yet paid: a Due one first, else the next Upcoming one.
  const next = rows.find((row) => row.status !== "paid") ?? null;
  const paidCount = rows.filter((row) => row.status === "paid").length;
  const dueCount = rows.filter((row) => row.status === "due").length;
  const paidCents = rows.reduce((sum, row) => sum + (row.payment?.amountCents ?? 0), 0);

  const details = [
    { label: "Investment amount", value: formatDollars(investment.principal) },
    { label: "Planned investment date", value: formatIsoDate(investment.investmentDate) },
    { label: "Interest starts", value: formatIsoDate(startDate) },
    { label: "Term locked", value: formatYears(investment.lockInYears) },
    { label: "Payout term", value: FREQUENCY_LABELS[investment.frequency] },
    { label: "Payout type", value: PAYOUT_TYPE_LABELS[investment.payoutType] },
    { label: "Maturity date", value: formatIsoDate(maturityDate(schedule)) },
    { label: "Paid to you so far", value: formatCents(paidCents) },
  ];

  return (
    <section aria-labelledby={headingId} className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 id={headingId} className="text-xl font-semibold text-slate-900 sm:text-2xl">
            {title}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {rows.length} {rows.length === 1 ? "payout" : "payouts"}, {paidCount} paid
            {dueCount > 0 && <>, {dueCount} due</>}. Interest starts {formatIsoDateLong(startDate)}.
          </p>
        </div>
        <StatementButton
          load={investorStatementAction.bind(null, investment.id)}
          label={`Download statement for the ${title}`}
        />
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
                <p className="mt-0.5 text-sm text-slate-600">
                  {next.status === "due" ? "Due" : "On"} {formatIsoDateLong(next.payoutDate)}
                </p>
              </>
            ) : (
              <p className="mt-1 text-lg font-semibold text-emerald-800">All payouts paid</p>
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
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${PAYOUT_STATUS_BADGES[row.status]}`}
                        >
                          {PAYOUT_STATUS_LABELS[row.status]}
                        </span>
                        {row.payment && (
                          <span className="mt-1 block whitespace-nowrap text-xs text-slate-600">
                            on {formatIsoDate(row.payment.paidOn)}
                            {row.payment.amountCents !== row.totalPayoutCents && (
                              <>, {formatCents(row.payment.amountCents)}</>
                            )}
                          </span>
                        )}
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
          A payout shows as Paid once our team has recorded the payment, with the date it was paid. Due means the
          scheduled date (Eastern Time) has arrived and the payment has not been recorded yet. Payouts fall every {MONTHS_LABEL[periodsPerYear] ?? "period"} from the interest
          start date and are not moved for weekends.
        </p>
      </div>
    </section>
  );
}
