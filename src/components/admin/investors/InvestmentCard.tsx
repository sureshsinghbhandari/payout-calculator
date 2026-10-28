import Link from "next/link";
import { adminStatementAction } from "@/app/admin/investors/actions";
import { StatementButton } from "@/components/StatementButton";
import type { Investment } from "@/lib/accounts";
import { formatCents, formatDollars, formatIsoDate, formatPercent, formatYears } from "@/lib/format";
import {
  isMatured,
  latestPaidOn,
  maturityDate,
  PAYOUT_STATUS_BADGES,
  PAYOUT_STATUS_LABELS,
  payoutsWithStatus,
  scheduleOrNull,
  type PayoutWithStatus,
} from "@/lib/investments";
import { FREQUENCY_LABELS, PAYOUT_TYPE_LABELS, type PayoutSchedule } from "@/lib/payout";
import { formatTimestamp } from "./fields";
import { PayoutPaymentControl } from "./PayoutPaymentControl";
import { secondaryButton } from "./ui";

interface Props {
  investorId: string;
  investment: Investment;
  number: number;
  /** Today's date in Eastern Time, YYYY-MM-DD. */
  today: string;
  /** Whether this admin may record payouts as paid. */
  canManagePayouts: boolean;
  /** Why no payment confirmation can be emailed to the investor, or null when it can. */
  confirmationBlocker: string | null;
  /** Numbers of the investment this one renews, and of the one that renewed it. */
  renewedFromNumber: number | null;
  renewedByNumber: number | null;
}

/**
 * One investment with its details (admin view, including the rate), recorded
 * payments, statement download, renewal and an expandable payout schedule.
 */
export function InvestmentCard({
  investorId,
  investment,
  number,
  today,
  canManagePayouts,
  confirmationBlocker,
  renewedFromNumber,
  renewedByNumber,
}: Props) {
  const schedule = scheduleOrNull(investment);
  const headingId = `investment-${investment.id}`;
  const rows = schedule ? payoutsWithStatus(investment, schedule, today) : [];
  const paidCount = rows.filter((r) => r.status === "paid").length;
  const dueCount = rows.filter((r) => r.status === "due").length;
  const paidCents = rows.reduce((sum, r) => sum + (r.payment?.amountCents ?? 0), 0);
  const matured = schedule ? isMatured(schedule, today) : false;

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
    { label: matured ? "Matured" : "Maturity date", value: schedule ? formatIsoDate(maturityDate(schedule)) : "–" },
    { label: "Payouts paid", value: schedule ? `${paidCount} of ${rows.length}` : "–" },
    { label: "Paid so far", value: formatCents(paidCents) },
  ];

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={headingId} className="text-base font-semibold text-slate-900">
              Investment {number}: {formatDollars(investment.principal)}
            </h3>
            {dueCount > 0 && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PAYOUT_STATUS_BADGES.due}`}>
                {dueCount} due
              </span>
            )}
            {matured && (
              <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                Term ended
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Recorded {formatTimestamp(investment.createdAt)}
            {renewedFromNumber !== null && <> · Renewal of investment {renewedFromNumber}</>}
            {renewedByNumber !== null && <> · Renewed as investment {renewedByNumber}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2 sm:justify-end">
          {matured && renewedByNumber === null && (
            <Link
              href={`/admin/investors/${encodeURIComponent(investorId)}/add-investment?renew=${encodeURIComponent(investment.id)}`}
              className={secondaryButton}
              aria-label={`Renew investment ${number}`}
            >
              Renew
            </Link>
          )}
          {schedule && (
            <StatementButton
              load={adminStatementAction.bind(null, investorId, investment.id)}
              label={`Download statement for investment ${number}`}
            />
          )}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        {details.map((item) => (
          <div key={item.label}>
            <dt className="text-xs text-slate-500">{item.label}</dt>
            <dd className="font-medium tabular-nums text-slate-900">{item.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-slate-500">
        The annual rate is visible to admins only. Investors never see it, not even in their statement.
      </p>

      {!schedule ? (
        <p role="alert" className="mt-4 text-sm font-medium text-red-700">
          The payout schedule could not be calculated for this investment.
        </p>
      ) : (
        // Open when payouts are waiting to be recorded.
        <details className="group mt-4 border-t border-slate-100 pt-4" open={dueCount > 0}>
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
            <span className="group-open:hidden">Show payout schedule and payments</span>
            <span className="hidden group-open:inline">Hide payout schedule and payments</span>
            <span className="font-normal text-slate-500">({schedule.rows.length} payouts)</span>
          </summary>
          <ScheduleTable
            schedule={schedule}
            rows={rows}
            investorId={investorId}
            investment={investment}
            today={today}
            canManagePayouts={canManagePayouts}
            confirmationBlocker={confirmationBlocker}
          />
        </details>
      )}
    </li>
  );
}

function ScheduleTable({
  schedule,
  rows,
  investorId,
  investment,
  today,
  canManagePayouts,
  confirmationBlocker,
}: {
  schedule: PayoutSchedule;
  rows: PayoutWithStatus[];
  investorId: string;
  investment: Investment;
  today: string;
  canManagePayouts: boolean;
  confirmationBlocker: string | null;
}) {
  const { totals, inputs } = schedule;
  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs text-slate-500 md:hidden">Swipe the table sideways to see every column.</p>
      <div
        className="relative overflow-x-auto rounded-xl border border-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
        tabIndex={0}
        role="region"
        aria-label="Payout schedule table, scrolls horizontally"
      >
        <table className="w-full min-w-[1040px] border-collapse text-sm">
          <caption className="sr-only">
            Payout schedule and payments for a {formatDollars(inputs.principal)} investment, all amounts in US dollars
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
              {canManagePayouts && (
                <th scope="col" className="px-4 py-3 text-left font-semibold">
                  <span className="sr-only">Payment</span>
                </th>
              )}
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
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${PAYOUT_STATUS_BADGES[row.status]}`}
                  >
                    {PAYOUT_STATUS_LABELS[row.status]}
                  </span>
                  {row.payment && (
                    <span className="mt-1 block max-w-[14rem] text-xs text-slate-600">
                      {formatIsoDate(row.payment.paidOn)}
                      {row.payment.amountCents !== row.totalPayoutCents && <>, {formatCents(row.payment.amountCents)}</>}
                      {row.payment.reference && <span className="block truncate">Ref {row.payment.reference}</span>}
                    </span>
                  )}
                </td>
                {canManagePayouts && (
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <PayoutPaymentControl
                      investorId={investorId}
                      investmentId={investment.id}
                      payoutNumber={row.payoutNumber}
                      payoutDate={row.payoutDate}
                      scheduledCents={row.totalPayoutCents}
                      payment={row.payment}
                      earliest={investment.investmentDate}
                      latest={latestPaidOn(today)}
                      today={today}
                      confirmationBlocker={confirmationBlocker}
                    />
                  </td>
                )}
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
              <td className="px-4 py-3" colSpan={canManagePayouts ? 2 : 1} />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Paid means a payment has been recorded. Due means the scheduled date (Eastern Time) has arrived without a recorded
        payment. The investor sees the same statuses in the portal.
      </p>
    </div>
  );
}
