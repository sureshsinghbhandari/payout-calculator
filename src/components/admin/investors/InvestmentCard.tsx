import type { Investment } from "@/lib/accounts";
import { formatCents, formatDollars, formatIsoDate, formatPercent, formatYears } from "@/lib/format";
import { calculatePayoutSchedule, FREQUENCY_LABELS, PAYOUT_TYPE_LABELS, type PayoutSchedule } from "@/lib/payout";
import { formatTimestamp } from "./fields";

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
    console.error("Payout schedule could not be calculated", investment.id, error);
    return null;
  }
}

/** One investment with its details (admin view, including the rate) and an expandable payout schedule. */
export function InvestmentCard({ investment, number }: { investment: Investment; number: number }) {
  const schedule = scheduleFor(investment);
  const headingId = `investment-${investment.id}`;
  const details = [
    { label: "Investment amount", value: formatDollars(investment.principal) },
    { label: "Planned investment date", value: formatIsoDate(investment.investmentDate) },
    { label: "Interest starts", value: schedule ? formatIsoDate(schedule.startDate) : "–" },
    { label: "Term locked", value: formatYears(investment.lockInYears) },
    { label: "Payout term", value: FREQUENCY_LABELS[investment.frequency] },
    { label: "Payout type", value: PAYOUT_TYPE_LABELS[investment.payoutType] },
    { label: "Annual rate", value: formatPercent(investment.annualRatePercent) },
    { label: "Total interest", value: schedule ? formatCents(schedule.totals.interestCents) : "–" },
    { label: "Total amount paid", value: schedule ? formatCents(schedule.totals.payoutCents) : "–" },
  ];

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={headingId} className="text-base font-semibold text-slate-900">
          Investment {number}: {formatDollars(investment.principal)}
        </h3>
        <p className="text-xs text-slate-500">Recorded {formatTimestamp(investment.createdAt)}</p>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        {details.map((item) => (
          <div key={item.label}>
            <dt className="text-xs text-slate-500">{item.label}</dt>
            <dd className="font-medium tabular-nums text-slate-900">{item.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-slate-500">The annual rate is visible to admins only. Investors never see it.</p>

      {!schedule ? (
        <p role="alert" className="mt-4 text-sm font-medium text-red-700">
          The payout schedule could not be calculated for this investment.
        </p>
      ) : (
        <details className="group mt-4 border-t border-slate-100 pt-4">
          <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-lg text-sm font-semibold text-blue-800 hover:text-blue-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 [&::-webkit-details-marker]:hidden">
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 transition-transform group-open:rotate-90"
            >
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
                clipRule="evenodd"
              />
            </svg>
            <span className="group-open:hidden">Show payout schedule</span>
            <span className="hidden group-open:inline">Hide payout schedule</span>
            <span className="font-normal text-slate-500">({schedule.rows.length} payouts)</span>
          </summary>
          <ScheduleTable schedule={schedule} />
        </details>
      )}
    </li>
  );
}

function ScheduleTable({ schedule }: { schedule: PayoutSchedule }) {
  const { rows, totals, inputs } = schedule;
  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs text-slate-500 md:hidden">Swipe the table sideways to see every column.</p>
      <div
        className="relative overflow-x-auto rounded-xl border border-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
        tabIndex={0}
        role="region"
        aria-label="Payout schedule table, scrolls horizontally"
      >
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <caption className="sr-only">
            Payout schedule for a {formatDollars(inputs.principal)} investment, all amounts in US dollars
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
            </tr>
          </thead>
          <tbody className="tabular-nums text-slate-800">
            {rows.map((row) => (
              <tr key={row.payoutNumber} className="border-b border-slate-100 even:bg-slate-50/60">
                <th scope="row" className="px-4 py-2.5 text-left font-medium text-slate-900">
                  {row.payoutNumber}
                </th>
                <td className="whitespace-nowrap px-4 py-2.5">{formatIsoDate(row.payoutDate)}</td>
                <td className="px-4 py-2.5 text-right">{formatCents(row.openingPrincipalCents)}</td>
                <td className="px-4 py-2.5 text-right">{formatCents(row.interestCents)}</td>
                <td className="px-4 py-2.5 text-right">{formatCents(row.principalRepaymentCents)}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-900">{formatCents(row.totalPayoutCents)}</td>
                <td className="px-4 py-2.5 text-right">{formatCents(row.remainingPrincipalCents)}</td>
              </tr>
            ))}
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
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
