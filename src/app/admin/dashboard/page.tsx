import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminBreadcrumb, AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { SignInAlerts } from "@/components/admin/SignInAlerts";
import { can, toPublicAdmin, type Investor } from "@/lib/accounts";
import {
  conversionRate,
  countByStatus,
  inquiriesPerWeek,
  investmentTotals,
  type InvestmentTotals,
  type WeekCount,
} from "@/lib/dashboard";
import { formatCents, formatDollars } from "@/lib/format";
import type { StoredInquiry } from "@/lib/inquiry";
import { isAccountStorageConfigured, listInvestors } from "@/lib/server/accounts-store";
import { requireAdminPage } from "@/lib/server/auth";
import { INQUIRY_LIST_LIMIT, isInquiryStorageConfigured, listInquiries } from "@/lib/server/inquiry-store";
import { todayEastern } from "@/lib/time";

export const metadata: Metadata = {
  title: "Dashboard | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

const WEEKS = 8;
const PAYOUT_PERIODS = [30, 90];

const weekFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const percentFormatter = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

function weekLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return weekFormatter.format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * Dashboard. Everyone sees the inquiry figures; Master Admins also see
 * investment totals, scheduled payouts and sign-in alerts. Sales Admins never
 * see money totals or rates.
 */
export default function DashboardPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <DashboardContent />
    </Suspense>
  );
}

async function loadInquiries(): Promise<{ inquiries: StoredInquiry[]; total: number } | null> {
  try {
    return await listInquiries();
  } catch (error) {
    console.error("Listing inquiries for the dashboard failed", error);
    return null;
  }
}

async function loadInvestors(): Promise<Investor[] | null> {
  try {
    return await listInvestors();
  } catch (error) {
    console.error("Listing investors for the dashboard failed", error);
    return null;
  }
}

async function DashboardContent() {
  await connection();
  const user = await requireAdminPage("dashboard.view");
  const showMoney = can(user.role, "investors.manage");
  const showAlerts = can(user.role, "audit.view");
  const today = todayEastern();

  const [inquiryData, investors] = await Promise.all([
    isInquiryStorageConfigured() ? loadInquiries() : null,
    showMoney && isAccountStorageConfigured() ? loadInvestors() : null,
  ]);

  return (
    <AdminFrame user={toPublicAdmin(user)}>
      <AdminBreadcrumb items={[{ label: "Admin", href: "/admin/inquiries" }, { label: "Dashboard" }]} />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">
          {showMoney
            ? "A quick look at inquiries, investments and sign-ins. Figures are worked out each time you open this page."
            : "A quick look at inquiries. Figures are worked out each time you open this page."}
        </p>
      </div>

      <div className="space-y-6">
        <InquiryFigures
          data={inquiryData}
          configured={isInquiryStorageConfigured()}
          showDeleted={can(user.role, "inquiries.delete")}
          today={today}
        />
        {showMoney && (
          <InvestmentFigures
            totals={investors ? investmentTotals(investors, today, PAYOUT_PERIODS) : null}
            configured={isAccountStorageConfigured()}
          />
        )}
        {showAlerts && (
          <Suspense
            fallback={
              <AdminCard>
                <p className="text-sm text-slate-600">Checking recent sign-ins…</p>
              </AdminCard>
            }
          >
            <SignInAlerts limit={5} showAuditLink />
          </Suspense>
        )}
      </div>
    </AdminFrame>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-xl font-semibold sm:text-2xl tabular-nums text-slate-900">{value}</dd>
      {note && <dd className="mt-0.5 text-xs text-slate-500">{note}</dd>}
    </div>
  );
}

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-3 text-lg font-semibold text-slate-900">
      {children}
    </h2>
  );
}

function InquiryFigures({
  data,
  configured,
  showDeleted,
  today,
}: {
  data: { inquiries: StoredInquiry[]; total: number } | null;
  configured: boolean;
  showDeleted: boolean;
  today: string;
}) {
  if (!configured || !data) {
    return (
      <section aria-labelledby="inquiry-figures">
        <SectionHeading id="inquiry-figures">Inquiries</SectionHeading>
        <AdminCard>
          {configured ? (
            <p role="alert" className="text-sm font-medium text-red-700">
              Inquiries could not be loaded. Reload the page to try again.
            </p>
          ) : (
            <p className="text-sm text-slate-700">Storage is not connected, so there are no inquiries to count.</p>
          )}
        </AdminCard>
      </section>
    );
  }

  const counts = countByStatus(data.inquiries);
  const rate = conversionRate(counts);
  const active = counts.new + counts.contacted + counts.converted;
  const weeks = inquiriesPerWeek(data.inquiries, today, WEEKS);

  return (
    <section aria-labelledby="inquiry-figures">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="inquiry-figures" className="text-lg font-semibold text-slate-900">
          Inquiries
        </h2>
        <Link href="/admin/inquiries" className="text-sm font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950">
          Go to inquiries
        </Link>
      </div>
      <dl className={`grid grid-cols-2 gap-3 ${showDeleted ? "sm:grid-cols-3 lg:grid-cols-6" : "sm:grid-cols-3 lg:grid-cols-5"}`}>
        <Stat label="Inquiries" value={String(active)} note="Not counting deleted" />
        <Stat label="New" value={String(counts.new)} />
        <Stat label="Contacted" value={String(counts.contacted)} />
        <Stat label="Converted" value={String(counts.converted)} />
        {showDeleted && <Stat label="Deleted" value={String(counts.deleted)} />}
        <Stat label="Conversion rate" value={rate === null ? "—" : percentFormatter.format(rate)} note="Converted of all inquiries" />
      </dl>
      {data.total > INQUIRY_LIST_LIMIT && (
        <p className="mt-2 text-xs text-slate-500">Based on the newest {INQUIRY_LIST_LIMIT} of {data.total} stored inquiries.</p>
      )}
      <div className="mt-4">
        <WeeklyChart weeks={weeks} />
      </div>
    </section>
  );
}

/** Bar chart in plain HTML. The bars are hidden from screen readers, which read the table instead. */
function WeeklyChart({ weeks }: { weeks: WeekCount[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const total = weeks.reduce((sum, w) => sum + w.count, 0);

  return (
    <figure className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <figcaption>
        <span className="block text-base font-semibold text-slate-900">Inquiries per week</span>
        <span className="mt-0.5 block text-xs text-slate-500">
          {total} in the last {weeks.length} weeks (Monday to Sunday, Eastern Time). The last bar is this week so far.
        </span>
      </figcaption>
      <div aria-hidden="true" className="mt-4">
        <div className="flex h-40 items-end gap-1.5 border-b border-slate-300 sm:gap-3">
          {weeks.map((week, i) => (
            <div key={week.weekStart} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
              <span className="mb-1 text-xs font-semibold tabular-nums text-slate-700">{week.count}</span>
              <div
                className={`w-full max-w-12 rounded-t ${i === weeks.length - 1 ? "bg-blue-400" : "bg-blue-900"}`}
                style={{ height: `${(week.count / max) * 100}%`, minHeight: week.count > 0 ? 4 : 0 }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5 sm:gap-3">
          {weeks.map((week, i) => (
            <span key={week.weekStart} className="min-w-0 flex-1 truncate text-center text-[10px] text-slate-500 sm:text-xs">
              {i === weeks.length - 1 ? "This week" : weekLabel(week.weekStart)}
            </span>
          ))}
        </div>
      </div>
      <table className="sr-only">
        <caption>Inquiries per week, oldest first</caption>
        <thead>
          <tr>
            <th scope="col">Week starting</th>
            <th scope="col">Inquiries</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, i) => (
            <tr key={week.weekStart}>
              <th scope="row">
                {weekLabel(week.weekStart)}
                {i === weeks.length - 1 ? " (this week so far)" : ""}
              </th>
              <td>{week.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function InvestmentFigures({ totals, configured }: { totals: InvestmentTotals | null; configured: boolean }) {
  return (
    <section aria-labelledby="investment-figures">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="investment-figures" className="text-lg font-semibold text-slate-900">
          Investments
        </h2>
        <Link href="/admin/investors" className="text-sm font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950">
          Go to investors
        </Link>
      </div>
      {!configured || !totals ? (
        <AdminCard>
          {configured ? (
            <p role="alert" className="text-sm font-medium text-red-700">
              Investors could not be loaded. Reload the page to try again.
            </p>
          ) : (
            <p className="text-sm text-slate-700">Account storage is not connected, so there are no investments to total.</p>
          )}
        </AdminCard>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Total invested"
              value={formatDollars(totals.investedDollars)}
              note={`${totals.investments} ${totals.investments === 1 ? "investment" : "investments"}`}
            />
            <Stat label="Investors" value={String(totals.investors)} />
            {totals.upcoming.map((period) => (
              <Stat
                key={period.days}
                label={`Payouts, next ${period.days} days`}
                value={formatCents(period.cents)}
                note={`${period.count} scheduled ${period.count === 1 ? "payout" : "payouts"}`}
              />
            ))}
          </dl>
          <p className="mt-2 text-xs text-slate-500">
            Payouts are taken from each investment&apos;s payout schedule, from tomorrow onwards.
            {totals.skipped > 0 &&
              ` ${totals.skipped} ${totals.skipped === 1 ? "investment has" : "investments have"} a schedule that could not be worked out and ${totals.skipped === 1 ? "is" : "are"} left out.`}
          </p>
        </>
      )}
    </section>
  );
}
