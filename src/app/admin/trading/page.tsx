import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminBreadcrumb, AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { MonthSheet } from "@/components/admin/trading/MonthSheet";
import { OverviewView } from "@/components/admin/trading/OverviewView";
import { TodayView } from "@/components/admin/trading/TodayView";
import { toPublicAdmin } from "@/lib/accounts";
import { requireAdminPage } from "@/lib/server/auth";
import { isMonthKey, isNotBuiltYet, isTradingApiConfigured } from "@/lib/server/trading-api";
import { loadMonth, loadOverview, loadToday, type Loaded } from "@/lib/server/trading-snapshots";
import { TRADING_ACCOUNTS as ACCOUNTS } from "@/lib/trading-accounts";
import { formatTimestamp } from "@/lib/time";

export const metadata: Metadata = {
  title: "Trading dashboard | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

const VIEWS = [
  { key: "overview", label: "Overview" },
  { key: "month", label: "Monthly sheet" },
  { key: "today", label: "Today" },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function TradingDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <TradingDashboardContent searchParams={searchParams} />
    </Suspense>
  );
}

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

/** The page's own address for an account / view / month (only what differs from the defaults goes into the query). */
function hrefFor({ tab, view, month }: { tab: string; view: ViewKey; month?: string | null }): string {
  const q = new URLSearchParams();
  if (tab !== ACCOUNTS[0].slug) q.set("tab", tab);
  if (view !== "overview") q.set("view", view);
  if (view === "month" && month) q.set("month", month);
  const qs = q.toString();
  return `/admin/trading${qs ? `?${qs}` : ""}`;
}

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
    active ? "border-blue-900 bg-blue-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
  }`;

/**
 * Read-only view of a separate app's (tradiersuinew) trading figures,
 * fetched over its data API (src/lib/server/trading-api.ts): the end-of-day
 * KPI tiles and strategy table (Overview), the month sheet of its Excel
 * export (Monthly sheet) and the positions expiring or closing today (Today),
 * for each account in ACCOUNTS. It places no orders and changes nothing
 * there. Master Admin only.
 */
async function TradingDashboardContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const user = await requireAdminPage("trading.view");
  const params = await searchParams;
  const account = ACCOUNTS.find((a) => a.slug === one(params.tab)) ?? ACCOUNTS[0];
  const view: ViewKey = VIEWS.find((v) => v.key === one(params.view))?.key ?? "overview";
  const requestedMonth = isMonthKey(one(params.month)) ? one(params.month) : null;

  const breadcrumb = <AdminBreadcrumb items={[{ label: "Admin", href: "/admin/inquiries" }, { label: "Trading dashboard" }]} />;

  if (!isTradingApiConfigured()) {
    return (
      <AdminFrame user={toPublicAdmin(user)}>
        {breadcrumb}
        <h1 className="mb-5 text-2xl font-semibold text-slate-900">Trading dashboard</h1>
        <AdminCard>
          <p className="text-sm text-slate-700">
            This is not set up yet. It reads trading results from a separate app on your own machine, over its data
            API (see that app&apos;s <code className="rounded bg-slate-100 px-1">docs/eod-excel.md</code>). Add two
            settings in Vercel, then redeploy:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-6 text-sm text-slate-700">
            <li>
              <code className="rounded bg-slate-100 px-1">TRADING_API_URL</code> — that app&apos;s address, e.g. its
              ngrok tunnel (no trailing slash).
            </li>
            <li>
              <code className="rounded bg-slate-100 px-1">TRADING_API_TOKEN</code> — the same value as{" "}
              <code className="rounded bg-slate-100 px-1">EOD_EXCEL_API_TOKEN</code> set there.
            </li>
          </ul>
          <p className="mt-3 text-sm text-slate-600">
            That other app, and its ngrok tunnel, also need to be running whenever this page is opened.
          </p>
        </AdminCard>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame user={toPublicAdmin(user)}>
      {breadcrumb}
      <h1 className="text-2xl font-semibold text-slate-900">Trading dashboard</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        Read-only figures from a separate trading app on your own machine — the same numbers as its end-of-day Excel
        export and its Overview tab. Nothing here places an order or changes anything there.
      </p>

      <div className="mt-5 space-y-3">
        <nav aria-label="Account" className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Account</span>
          {ACCOUNTS.map((a) => (
            <Link
              key={a.slug}
              href={hrefFor({ tab: a.slug, view, month: requestedMonth })}
              aria-current={a.slug === account.slug ? "page" : undefined}
              className={chip(a.slug === account.slug)}
            >
              {a.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="View" className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">View</span>
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={hrefFor({ tab: account.slug, view: v.key, month: requestedMonth })}
              aria-current={v.key === view ? "page" : undefined}
              className={chip(v.key === view)}
            >
              {v.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-5">
        {view === "overview" && <OverviewSection slug={account.slug} />}
        {view === "month" && <MonthSection slug={account.slug} month={requestedMonth} />}
        {view === "today" && <TodaySection slug={account.slug} />}
      </div>
    </AdminFrame>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <AdminCard>
      <p role="alert" className="text-sm font-medium text-red-700">
        {message}
      </p>
    </AdminCard>
  );
}

/** What to show while the other app has not been given a new part of the data API yet (docs/trading-dashboard-api.md). */
function NotBuiltYetCard({ what }: { what: string }) {
  return (
    <AdminCard>
      <p className="text-sm font-medium text-slate-900">The trading app does not serve {what} yet.</p>
      <p className="mt-2 text-sm text-slate-700">
        This view needs an addition to that app&apos;s data API. The contract and a ready-to-paste prompt for building
        it there are in this repo&apos;s <code className="rounded bg-slate-100 px-1">docs/trading-dashboard-api.md</code>.
        Once it is added and that app restarted, this view fills in by itself.
      </p>
    </AdminCard>
  );
}

/** Shown above a view that comes from the saved copy instead of the trading app. */
function SavedCopyNotice({ stale }: { stale: NonNullable<Extract<Loaded<unknown>, { ok: true }>["stale"]> }) {
  const when = formatTimestamp(stale.savedAt);
  return (
    <p role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
      {stale.reason === "final"
        ? `Closed month, shown from the copy saved ${when}.`
        : `The trading app is unreachable. Showing the copy saved ${when}; it updates after each market close (4:01 PM Eastern) and whenever the app can be reached.`}
    </p>
  );
}

async function OverviewSection({ slug }: { slug: string }) {
  const result = await loadOverview(slug);
  if (!result.ok) return <ErrorCard message={result.error} />;
  return (
    <>
      {result.stale && <SavedCopyNotice stale={result.stale} />}
      <OverviewView data={result.value} />
    </>
  );
}

async function MonthSection({ slug, month }: { slug: string; month: string | null }) {
  const result = await loadMonth(slug, month);
  if (!result.ok) {
    return isNotBuiltYet(result, "month") ? <NotBuiltYetCard what="its month sheets" /> : <ErrorCard message={result.error} />;
  }
  const sheet = result.value.month;
  if (!sheet) return <NotBuiltYetCard what="its month sheets" />;
  return (
    <>
      {result.stale && <SavedCopyNotice stale={result.stale} />}
      <MonthSheet month={sheet} tab={result.value.tab} hrefFor={(m) => hrefFor({ tab: slug, view: "month", month: m })} />
    </>
  );
}

async function TodaySection({ slug }: { slug: string }) {
  const result = await loadToday(slug);
  if (!result.ok) {
    return isNotBuiltYet(result, "today") ? <NotBuiltYetCard what="today's positions" /> : <ErrorCard message={result.error} />;
  }
  return (
    <>
      {result.stale && <SavedCopyNotice stale={result.stale} />}
      <TodayView data={result.value} />
    </>
  );
}
