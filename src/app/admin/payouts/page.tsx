import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminBreadcrumb, AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { errorNotice, inputClass, primaryButton, textLink } from "@/components/admin/investors/ui";
import { toPublicAdmin, type Investor } from "@/lib/accounts";
import { formatCents, formatDollars, formatIsoDate, formatIsoDateLong } from "@/lib/format";
import { PAYOUT_STATUS_BADGES, PAYOUT_STATUS_LABELS, todayEastern } from "@/lib/investments";
import {
  collectPayouts,
  groupPayouts,
  parseCalendarRange,
  sumScheduled,
  type CalendarEntry,
  type CalendarGrouping,
} from "@/lib/payout-calendar";
import { isAccountStorageConfigured, listInvestors } from "@/lib/server/accounts-store";
import { requireAdminPage } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Payout calendar | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Payout calendar (Master Admin): scheduled payouts across all investors for
 * cash planning. Payouts that are due and not yet recorded come first, then
 * the chosen range grouped by week or month with totals.
 */
export default function PayoutsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <PayoutsContent searchParams={searchParams} />
    </Suspense>
  );
}

const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

function groupLabel(start: string, grouping: CalendarGrouping): string {
  if (grouping === "month") return monthFormatter.format(new Date(`${start}T00:00:00Z`));
  return `Week of ${formatIsoDateLong(start)}`;
}

function countText(count: number): string {
  return `${count} ${count === 1 ? "payout" : "payouts"}`;
}

async function PayoutsContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const admin = await requireAdminPage("payouts.manage");
  const today = todayEastern();
  const range = parseCalendarRange(await searchParams, today);

  let investors: Investor[] | null = null;
  if (isAccountStorageConfigured()) {
    try {
      investors = await listInvestors();
    } catch (error) {
      console.error("Listing investors for the payout calendar failed", error);
    }
  }

  const all = investors ? collectPayouts(investors, today) : [];
  // Due payouts (any date up to today) come first; the range shows everything else.
  const due = all.filter((e) => e.status === "due");
  const inRange = all.filter((e) => e.status !== "due" && e.payoutDate >= range.from && e.payoutDate <= range.to);
  const groups = groupPayouts(inRange, range.group);
  const upcoming = inRange.filter((e) => e.status === "upcoming");
  const paid = inRange.filter((e) => e.status === "paid");
  const tiles = [
    { label: "Due, not yet recorded", count: due.length, cents: sumScheduled(due), highlight: due.length > 0 },
    { label: "Upcoming in this range", count: upcoming.length, cents: sumScheduled(upcoming) },
    {
      label: "Paid in this range",
      count: paid.length,
      cents: paid.reduce((sum, e) => sum + (e.paidCents ?? 0), 0),
    },
  ];

  return (
    <AdminFrame user={toPublicAdmin(admin)}>
      <AdminBreadcrumb items={[{ label: "Admin", href: "/admin/inquiries" }, { label: "Payout calendar" }]} />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Payout calendar</h1>
          <p className="mt-1 text-sm text-slate-600">
            Scheduled payouts of all investors, {formatIsoDate(range.from)} to {formatIsoDate(range.to)}. Mark payouts as
            paid on the investor&apos;s page.
          </p>
        </div>
        <Link href="/admin/investors" className={`text-sm ${textLink}`}>
          Go to investors
        </Link>
      </div>

      <form method="get" className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="calendar-from" className="text-sm font-semibold text-slate-900">
              From
            </label>
            <input id="calendar-from" name="from" type="date" defaultValue={range.from} required className={inputClass()} />
          </div>
          <div>
            <label htmlFor="calendar-to" className="text-sm font-semibold text-slate-900">
              To
            </label>
            <input id="calendar-to" name="to" type="date" defaultValue={range.to} required className={inputClass()} />
          </div>
          <div>
            <label htmlFor="calendar-group" className="text-sm font-semibold text-slate-900">
              Group by
            </label>
            <select id="calendar-group" name="group" defaultValue={range.group} className={inputClass()}>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </div>
          <button type="submit" className={primaryButton}>
            Show
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Dates are in Eastern Time. <Link href="/admin/payouts" className={textLink}>Reset to the next 90 days</Link>
        </p>
      </form>

      {range.error && (
        <p role="alert" className={`mb-6 ${errorNotice}`}>
          {range.error}
        </p>
      )}

      {!isAccountStorageConfigured() ? (
        <AdminCard>
          <p className="text-sm text-slate-700">Account storage is not connected, so payouts cannot be shown.</p>
        </AdminCard>
      ) : !investors ? (
        <AdminCard>
          <p role="alert" className="text-sm font-medium text-red-700">
            Payouts could not be loaded. Reload the page to try again.
          </p>
        </AdminCard>
      ) : (
        <div className="space-y-8">
          <dl className="grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 shadow-sm sm:grid-cols-3">
            {tiles.map((tile) => (
              <div key={tile.label} className={tile.highlight ? "bg-amber-50 p-5" : "bg-white p-5"}>
                <dt className="text-sm text-slate-600">{tile.label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
                  {formatCents(tile.cents)}
                </dd>
                <dd className="text-sm text-slate-600">{countText(tile.count)}</dd>
              </div>
            ))}
          </dl>

          {due.length > 0 && (
            <section aria-labelledby="payouts-due-heading">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="payouts-due-heading" className="text-lg font-semibold text-slate-900">
                  Due, not yet recorded
                </h2>
                <p className="text-sm text-slate-600">
                  {countText(due.length)}, {formatCents(sumScheduled(due))}
                </p>
              </div>
              <p className="mb-3 text-sm text-slate-600">
                Scheduled on or before today without a recorded payment, oldest first. Once paid, mark them as paid on the
                investor&apos;s page.
              </p>
              <PayoutsTable entries={due} caption="Payouts due and not yet recorded, oldest first" />
            </section>
          )}

          {groups.length === 0 ? (
            <AdminCard>
              <p className="text-sm text-slate-600">
                {investors.length === 0
                  ? "No investors yet, so there are no payouts."
                  : "No other payouts are scheduled in this range."}
              </p>
            </AdminCard>
          ) : (
            groups.map((group) => {
              const label = groupLabel(group.start, range.group);
              const headingId = `payouts-${group.key}`;
              return (
                <section key={group.key} aria-labelledby={headingId}>
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 id={headingId} className="text-lg font-semibold text-slate-900">
                      {label}
                    </h2>
                    <p className="text-sm tabular-nums text-slate-600">
                      {countText(group.entries.length)}, {formatCents(group.scheduledCents)} scheduled
                      {group.paidCents > 0 && <>, {formatCents(group.paidCents)} paid</>}
                    </p>
                  </div>
                  <PayoutsTable entries={group.entries} caption={`Payouts, ${label}`} />
                </section>
              );
            })
          )}
        </div>
      )}
    </AdminFrame>
  );
}

function PayoutsTable({ entries, caption }: { entries: CalendarEntry[]; caption: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 md:hidden">Swipe the table sideways to see every column.</p>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div
          className="relative overflow-x-auto rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
          tabIndex={0}
          role="region"
          aria-label={`${caption}, scrolls horizontally`}
        >
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <th scope="col" className="px-4 py-3 text-left font-semibold sm:pl-6">
                  Scheduled date
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold">
                  Investor
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold">
                  Investment
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Amount
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold sm:pr-6">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums text-slate-800">
              {entries.map((e) => (
                <tr key={`${e.investmentId}-${e.payoutNumber}`} className="border-b border-slate-100 last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-3 sm:pl-6">{formatIsoDate(e.payoutDate)}</td>
                  <th scope="row" className="px-4 py-3 text-left font-medium">
                    <Link href={`/admin/investors/${encodeURIComponent(e.investorId)}`} className={textLink}>
                      {e.investorName}
                    </Link>
                  </th>
                  <td className="px-4 py-3">
                    Investment {e.investmentNumber}: {formatDollars(e.principal)}
                    <span className="block text-xs text-slate-500">
                      Payout {e.payoutNumber} of {e.totalPayouts}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">
                    {formatCents(e.scheduledCents)}
                  </td>
                  <td className="px-4 py-3 sm:pr-6">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${PAYOUT_STATUS_BADGES[e.status]}`}>
                      {PAYOUT_STATUS_LABELS[e.status]}
                    </span>
                    {e.paidOn && (
                      <span className="mt-1 block whitespace-nowrap text-xs text-slate-600">
                        {formatIsoDate(e.paidOn)}
                        {e.paidCents !== null && e.paidCents !== e.scheduledCents && <>, {formatCents(e.paidCents)}</>}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
