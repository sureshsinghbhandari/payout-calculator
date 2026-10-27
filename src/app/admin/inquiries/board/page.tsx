import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminBreadcrumb, AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { InquiryActions } from "@/components/admin/InquiryActions";
import { can, toPublicAdmin } from "@/lib/accounts";
import { formatDollars, formatIsoDate } from "@/lib/format";
import {
  DEFAULT_LEAD_SOURCE,
  followUpState,
  inquiryListSearch,
  isInquiryListNarrowed,
  matchesInquiryListQuery,
  parseInquiryListQuery,
  todayUtc,
  type StoredInquiry,
} from "@/lib/inquiry";
import { requireAdminPage } from "@/lib/server/auth";
import { isInquiryStorageConfigured, listInquiries } from "@/lib/server/inquiry-store";

export const metadata: Metadata = {
  title: "Pipeline | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function PipelinePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <PipelineContent searchParams={searchParams} />
    </Suspense>
  );
}

const COLUMNS = [
  { status: "new", title: "New", hint: "Mark as contacted once you have spoken to them.", accent: "border-t-blue-900" },
  { status: "contacted", title: "Contacted", hint: "Convert to an investor once they invest.", accent: "border-t-slate-400" },
  { status: "converted", title: "Converted", hint: "Now investors.", accent: "border-t-emerald-500" },
] as const;

const FOLLOW_UP_TEXT = {
  overdue: "text-red-700",
  today: "text-amber-800",
  upcoming: "text-slate-600",
  closed: "text-slate-500",
} as const;

const linkClass = "text-sm font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950";

/**
 * Pipeline board: active inquiries in New, Contacted and Converted columns,
 * with the same search and filters as the Inquiries list (except status).
 * Cards move with the usual buttons; marking contacted still asks for a note.
 */
async function PipelineContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const user = await requireAdminPage("inquiries.view");
  const query = { ...parseInquiryListQuery(await searchParams), status: "all" as const };
  const today = todayUtc();
  const canChangeStatus = can(user.role, "inquiries.status");
  const canConvert = can(user.role, "inquiries.convert");
  const canSeeInvestors = can(user.role, "investors.manage");

  let inquiries: StoredInquiry[] | null = null;
  try {
    inquiries = (await listInquiries()).inquiries.filter(
      (i) => i.status !== "deleted" && matchesInquiryListQuery(i, query, { userId: user.id, today }),
    );
  } catch (error) {
    console.error("Listing inquiries failed", error);
  }
  const narrowed = isInquiryListNarrowed(query);
  const listHref = `/admin/inquiries${inquiryListSearch({ ...query, status: "open" })}`;

  return (
    <AdminFrame user={toPublicAdmin(user)}>
      <AdminBreadcrumb items={[{ label: "Admin", href: "/admin/inquiries" }, { label: "Inquiries", href: listHref }, { label: "Pipeline" }]} />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Pipeline</h1>
          <p className="mt-1 text-sm text-slate-600">
            Inquiries by status, newest first in each column.
            {narrowed && " Filtered like the Inquiries list."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {narrowed && (
            <Link href="/admin/inquiries/board" className={linkClass}>
              Clear filters
            </Link>
          )}
          <Link href={listHref} className={linkClass}>
            List view
          </Link>
        </div>
      </div>

      {!isInquiryStorageConfigured() ? (
        <AdminCard>
          <p className="text-sm text-slate-700">Storage is not connected, so inquiries cannot be received or shown.</p>
        </AdminCard>
      ) : !inquiries ? (
        <AdminCard>
          <p role="alert" className="text-sm font-medium text-red-700">
            Inquiries could not be loaded. Reload the page to try again.
          </p>
        </AdminCard>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((column) => {
            const cards = inquiries.filter((i) => i.status === column.status);
            return (
              <section
                key={column.status}
                aria-labelledby={`column-${column.status}`}
                className={`min-w-0 rounded-2xl border border-t-4 border-slate-200 bg-slate-50 p-3 ${column.accent}`}
              >
                <h2 id={`column-${column.status}`} className="px-1 text-base font-semibold text-slate-900">
                  {column.title} <span className="font-normal text-slate-500">({cards.length})</span>
                </h2>
                <p className="mb-3 px-1 text-xs text-slate-500">{column.hint}</p>
                {cards.length === 0 ? (
                  <p className="px-1 pb-2 text-sm text-slate-500">None.</p>
                ) : (
                  <ul className="space-y-2">
                    {cards.map((inquiry) => {
                      const followUp = followUpState(inquiry, today);
                      return (
                        <li key={inquiry.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <Link
                            href={`/admin/inquiries/${inquiry.id}`}
                            className="block break-words font-semibold text-blue-900 hover:underline"
                          >
                            {inquiry.name}
                          </Link>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {formatDollars(inquiry.plan.principal)} · Received {formatIsoDate(inquiry.createdAt.slice(0, 10))}
                            {inquiry.source !== DEFAULT_LEAD_SOURCE && <> · {inquiry.source}</>}
                          </p>
                          <p className="mt-1 text-xs text-slate-700">
                            {inquiry.assignedTo ? `Assigned to ${inquiry.assignedTo.name}` : "Not assigned"}
                            {followUp && inquiry.followUpDate && (
                              <span className={`font-semibold ${FOLLOW_UP_TEXT[followUp]}`}>
                                {" "}
                                · {followUp === "overdue" ? "Overdue " : followUp === "today" ? "Due today " : "Follow up "}
                                {formatIsoDate(inquiry.followUpDate)}
                              </span>
                            )}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {inquiry.status === "contacted" && canConvert && (
                              <Link
                                href={`/admin/inquiries/${inquiry.id}/convert`}
                                className="rounded-lg bg-blue-900 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                              >
                                Convert
                              </Link>
                            )}
                            {inquiry.status === "converted" && inquiry.investorId && canSeeInvestors && (
                              <Link href={`/admin/investors/${inquiry.investorId}`} className={linkClass}>
                                View investor
                              </Link>
                            )}
                            {/* Mark as contacted (asks for a note) and Mark as new, as on the list. */}
                            <InquiryActions
                              id={inquiry.id}
                              status={inquiry.status}
                              name={inquiry.name}
                              canChangeStatus={canChangeStatus}
                              canDelete={false}
                              canPurge={false}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </AdminFrame>
  );
}
