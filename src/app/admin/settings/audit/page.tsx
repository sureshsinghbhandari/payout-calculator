import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminBreadcrumb, AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { SignInAlerts } from "@/components/admin/SignInAlerts";
import { ROLE_LABELS, toPublicAdmin } from "@/lib/accounts";
import {
  AUDIT_CATEGORY_LABELS,
  AUDIT_EXPORT_MAX_DAYS,
  auditMonth,
  auditMonthRange,
  isAuditMonth,
  type AuditCategory,
  type AuditEvent,
} from "@/lib/audit";
import { requireAdminPage } from "@/lib/server/auth";
import { listAuditEvents, listAuditMonths } from "@/lib/server/audit-store";

export const metadata: Metadata = {
  title: "Audit log | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const MAX_ROWS = 500;

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "UTC",
});

const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return monthFormatter.format(new Date(Date.UTC(y, m - 1, 1)));
}

const dateInput =
  "mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/30";

const CATEGORIES = Object.keys(AUDIT_CATEGORY_LABELS) as AuditCategory[];

export default function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AuditContent searchParams={searchParams} />
    </Suspense>
  );
}

function actorBadge(event: AuditEvent): { label: string; className: string } {
  const { actor } = event;
  if (actor.kind === "admin") {
    return actor.role === "master"
      ? { label: ROLE_LABELS.master, className: "bg-blue-900 text-white" }
      : { label: ROLE_LABELS.sales, className: "bg-sky-100 text-sky-900" };
  }
  if (actor.kind === "investor") return { label: "Investor", className: "bg-emerald-100 text-emerald-800" };
  if (actor.kind === "visitor") return { label: "Visitor", className: "bg-slate-200 text-slate-700" };
  return { label: "System", className: "bg-slate-200 text-slate-700" };
}

function targetHref(event: AuditEvent): string | null {
  const t = event.target;
  if (!t) return null;
  if (t.type === "investor" && t.id) return `/admin/investors/${t.id}`;
  if (t.type === "inquiry") return t.id && event.action !== "inquiry.purged" ? `/admin/inquiries/${t.id}` : "/admin/inquiries";
  if (t.type === "user") return "/admin/settings/users";
  if (t.type === "rates") return "/admin/settings/rates";
  if (t.type === "products") return "/admin/settings/amounts-and-terms";
  return null;
}

async function AuditContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const user = await requireAdminPage("audit.view");
  const params = await searchParams;

  const currentMonth = auditMonth(new Date().toISOString());
  const requestedMonth = typeof params.month === "string" && isAuditMonth(params.month) ? params.month : currentMonth;
  const category =
    typeof params.category === "string" && (CATEGORIES as string[]).includes(params.category)
      ? (params.category as AuditCategory)
      : null;

  let events: AuditEvent[] = [];
  let months: string[] = [];
  let loadError = false;
  try {
    [events, months] = await Promise.all([listAuditEvents(requestedMonth), listAuditMonths()]);
  } catch (error) {
    console.error("Loading audit log failed", error);
    loadError = true;
  }
  if (!months.includes(currentMonth)) months = [currentMonth, ...months];
  if (!months.includes(requestedMonth)) months = [...months, requestedMonth].sort().reverse();

  const exportRange = auditMonthRange(requestedMonth);
  const exportProblem =
    params.export === "invalid"
      ? `The export needs a start date on or before the end date, at most ${AUDIT_EXPORT_MAX_DAYS} days apart.`
      : params.export === "failed"
        ? "The export could not be created. Please try again."
        : null;

  const filtered = category ? events.filter((e) => e.category === category) : events;
  const shown = filtered.slice(0, MAX_ROWS);

  const href = (next: { month?: string; category?: AuditCategory | null }) => {
    const q = new URLSearchParams();
    const m = next.month ?? requestedMonth;
    const c = next.category === undefined ? category : next.category;
    if (m !== currentMonth) q.set("month", m);
    if (c) q.set("category", c);
    const qs = q.toString();
    return `/admin/settings/audit${qs ? `?${qs}` : ""}`;
  };

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-semibold ${
      active ? "border-blue-900 bg-blue-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
    }`;

  return (
    <AdminFrame user={toPublicAdmin(user)}>
      <AdminBreadcrumb items={[{ label: "Admin", href: "/admin/inquiries" }, { label: "Settings" }, { label: "Audit log" }]} />
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-slate-900">Audit log</h1>
        <p className="mt-1 text-sm text-slate-600">
          Who did what, and when. Times are in UTC. Customer email responses will appear here once the Gmail
          integration is added. Sign-in alerts flag repeated failed sign-ins and admin sign-ins from a new device or
          network.
        </p>
      </div>

      <div className="mb-5">
        <Suspense
          fallback={
            <AdminCard>
              <p className="text-sm text-slate-600">Checking recent sign-ins…</p>
            </AdminCard>
          }
        >
          <SignInAlerts limit={20} showAuditLink={false} />
        </Suspense>
      </div>

      <div className="mb-5 space-y-3">
        <nav aria-label="Month" className="flex flex-wrap gap-2">
          {months.slice(0, 12).map((m) => (
            <Link key={m} href={href({ month: m })} aria-current={m === requestedMonth ? "page" : undefined} className={chip(m === requestedMonth)}>
              {monthLabel(m)}
            </Link>
          ))}
        </nav>
        <nav aria-label="Category" className="flex flex-wrap gap-2">
          <Link href={href({ category: null })} aria-current={!category ? "page" : undefined} className={chip(!category)}>
            All
          </Link>
          {CATEGORIES.map((c) => (
            <Link key={c} href={href({ category: c })} aria-current={category === c ? "page" : undefined} className={chip(category === c)}>
              {AUDIT_CATEGORY_LABELS[c]}
            </Link>
          ))}
        </nav>
      </div>

      <form
        key={requestedMonth}
        method="get"
        action="/admin/settings/audit/export"
        aria-labelledby="audit-export-heading"
        className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      >
        <h2 id="audit-export-heading" className="text-base font-semibold text-slate-900">
          Export to Excel
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Downloads every event between the two dates (both included, UTC), in all categories.
        </p>
        {exportProblem && (
          <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            {exportProblem}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block text-sm font-medium text-slate-700">
            From
            <input type="date" name="from" required defaultValue={exportRange.from} className={dateInput} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            To
            <input type="date" name="to" required defaultValue={exportRange.to} className={dateInput} />
          </label>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg bg-blue-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
          >
            Export to Excel
          </button>
        </div>
      </form>

      {loadError ? (
        <AdminCard>
          <p role="alert" className="text-sm font-medium text-red-700">
            The audit log could not be loaded. Reload the page to try again.
          </p>
        </AdminCard>
      ) : shown.length === 0 ? (
        <AdminCard>
          <p className="text-sm text-slate-600">No activity recorded for {monthLabel(requestedMonth)}
            {category ? ` in ${AUDIT_CATEGORY_LABELS[category]}` : ""}.</p>
        </AdminCard>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <p className="px-5 pt-4 text-xs text-slate-500">
            {filtered.length} {filtered.length === 1 ? "event" : "events"} in {monthLabel(requestedMonth)}, newest first
            {filtered.length > MAX_ROWS ? ` (showing the newest ${MAX_ROWS})` : ""}.
          </p>
          <div className="relative mt-3 overflow-x-auto rounded-b-2xl">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                  <th scope="col" className="px-5 py-3 font-semibold">When (UTC)</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Who</th>
                  <th scope="col" className="px-4 py-3 font-semibold">What</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Item</th>
                </tr>
              </thead>
              <tbody className="text-slate-800">
                {shown.map((event) => {
                  const badge = actorBadge(event);
                  const link = targetHref(event);
                  return (
                    <tr key={event.id} className="border-b border-slate-100 align-top">
                      <td className="whitespace-nowrap px-5 py-3 tabular-nums text-slate-600">
                        {timeFormatter.format(new Date(event.at))}
                      </td>
                      <td className="px-4 py-3">
                        <span className="block font-medium text-slate-900">{event.actor.name}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge.className}`}>
                            {badge.label}
                          </span>
                          {event.actor.username && <span className="text-xs text-slate-500">{event.actor.username}</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {event.summary}
                        <span className="mt-0.5 block text-xs text-slate-500">{AUDIT_CATEGORY_LABELS[event.category] ?? event.category}</span>
                      </td>
                      <td className="px-4 py-3">
                        {event.target ? (
                          link ? (
                            <Link href={link} className="font-medium text-blue-800 underline underline-offset-2 hover:text-blue-950">
                              {event.target.label}
                            </Link>
                          ) : (
                            event.target.label
                          )
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminFrame>
  );
}
