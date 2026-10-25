import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminCard, AdminFrame, AdminTabs } from "@/components/admin/AdminFrame";
import { InquiryActions } from "@/components/admin/InquiryActions";
import { formatCents, formatDollars, formatIsoDate, formatPercent, formatYears } from "@/lib/format";
import { inquiryReference, type StoredInquiry } from "@/lib/inquiry";
import { FREQUENCY_LABELS, PAYOUT_TYPE_LABELS } from "@/lib/payout";
import { adminConfig, isAdmin } from "@/lib/server/admin-auth";
import { INQUIRY_LIST_LIMIT, isInquiryStorageConfigured, listInquiries } from "@/lib/server/inquiry-store";

export const metadata: Metadata = {
  title: "Inquiries | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

export default function InquiriesPage() {
  return (
    <AdminFrame>
      <Suspense fallback={<p className="text-sm text-slate-600">Loading…</p>}>
        <InquiriesContent />
      </Suspense>
    </AdminFrame>
  );
}

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function InquiryCard({ inquiry }: { inquiry: StoredInquiry }) {
  const { plan } = inquiry;
  const details = [
    { label: "Investment amount", value: formatDollars(plan.principal) },
    { label: "Planned investment date", value: formatIsoDate(plan.investmentDate) },
    { label: "Term locked", value: formatYears(plan.lockInYears) },
    { label: "Payout term", value: FREQUENCY_LABELS[plan.frequency] },
    { label: "Payout type", value: PAYOUT_TYPE_LABELS[plan.payoutType] },
    { label: "Rate at the time", value: formatPercent(plan.annualRatePercent) },
    { label: "Total interest", value: formatCents(plan.totalInterestCents) },
    { label: "Total amount paid", value: formatCents(plan.totalPaidCents) },
  ];
  const isNew = inquiry.status === "new";

  return (
    <li className={`rounded-2xl border bg-white p-5 shadow-sm ${isNew ? "border-blue-300" : "border-slate-200"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-900">
            {inquiry.name}
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                isNew ? "bg-blue-900 text-white" : "bg-slate-200 text-slate-700"
              }`}
            >
              {isNew ? "New" : "Contacted"}
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {timestampFormatter.format(new Date(inquiry.createdAt))} UTC · Ref {inquiryReference(inquiry.id)}
          </p>
        </div>
        <InquiryActions id={inquiry.id} status={inquiry.status} name={inquiry.name} />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <a href={`mailto:${inquiry.email}`} className="font-medium text-blue-800 underline underline-offset-2 hover:text-blue-950">
          {inquiry.email}
        </a>
        {inquiry.phone && (
          <a href={`tel:${inquiry.phone.replace(/[^\d+]/g, "")}`} className="font-medium text-blue-800 underline underline-offset-2 hover:text-blue-950">
            {inquiry.phone}
          </a>
        )}
      </div>

      {inquiry.message && (
        <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-800">{inquiry.message}</p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-sm sm:grid-cols-4">
        {details.map((item) => (
          <div key={item.label}>
            <dt className="text-xs text-slate-500">{item.label}</dt>
            <dd className="font-medium text-slate-900">{item.value}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

async function InquiriesContent() {
  await connection();
  // Sign-in only happens on /admin (behind the firewall rate limit).
  if (!adminConfig().ok || !(await isAdmin())) redirect("/admin");

  let data: Awaited<ReturnType<typeof listInquiries>> | null = null;
  try {
    data = await listInquiries();
  } catch (error) {
    console.error("Listing inquiries failed", error);
  }

  const newCount = data?.inquiries.filter((i) => i.status === "new").length ?? 0;

  return (
    <div>
      <AdminTabs active="inquiries" />
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-slate-900">Inquiries</h1>
        <p className="mt-1 text-sm text-slate-600">
          {data
            ? `${data.total} ${data.total === 1 ? "inquiry" : "inquiries"}, ${newCount} new. Newest first.`
            : "Inquiries sent from the calculator."}
          {data && data.total > INQUIRY_LIST_LIMIT && ` Showing the newest ${INQUIRY_LIST_LIMIT}.`}
        </p>
      </div>

      {!isInquiryStorageConfigured() ? (
        <AdminCard>
          <p className="text-sm text-slate-700">Storage is not connected, so inquiries cannot be received or shown.</p>
        </AdminCard>
      ) : !data ? (
        <AdminCard>
          <p role="alert" className="text-sm font-medium text-red-700">
            Inquiries could not be loaded. Reload the page to try again.
          </p>
        </AdminCard>
      ) : data.inquiries.length === 0 ? (
        <AdminCard>
          <p className="text-sm text-slate-600">No inquiries yet. They appear here when visitors select Send inquiry.</p>
        </AdminCard>
      ) : (
        <ul className="space-y-4">
          {data.inquiries.map((inquiry) => (
            <InquiryCard key={inquiry.id} inquiry={inquiry} />
          ))}
        </ul>
      )}
    </div>
  );
}
