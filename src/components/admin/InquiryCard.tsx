import { formatCents, formatDollars, formatIsoDate, formatPercent, formatYears } from "@/lib/format";
import { inquiryReference, type InquiryStatus, type StoredInquiry } from "@/lib/inquiry";
import { FREQUENCY_LABELS, PAYOUT_TYPE_LABELS } from "@/lib/payout";
import { InquiryActions } from "./InquiryActions";

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatTimestamp(iso: string): string {
  return `${timestampFormatter.format(new Date(iso))} UTC`;
}

const STATUS_STYLES: Record<InquiryStatus, { label: string; badge: string; border: string }> = {
  new: { label: "New", badge: "bg-blue-900 text-white", border: "border-blue-300" },
  contacted: { label: "Contacted", badge: "bg-slate-200 text-slate-700", border: "border-slate-200" },
  deleted: { label: "Deleted", badge: "bg-red-100 text-red-800", border: "border-slate-200" },
};

export function InquiryCard({ inquiry }: { inquiry: StoredInquiry }) {
  const { plan } = inquiry;
  const style = STATUS_STYLES[inquiry.status];
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

  return (
    <li className={`rounded-2xl border bg-white p-5 shadow-sm ${style.border}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-900">
            {inquiry.name}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${style.badge}`}>
              {style.label}
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Received {formatTimestamp(inquiry.createdAt)} · Ref {inquiryReference(inquiry.id)}
            {inquiry.status === "deleted" && inquiry.deletedAt && <> · Deleted {formatTimestamp(inquiry.deletedAt)}</>}
          </p>
        </div>
        <InquiryActions id={inquiry.id} status={inquiry.status} name={inquiry.name} />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <a href={`mailto:${inquiry.email}`} className="font-medium text-blue-800 underline underline-offset-2 hover:text-blue-950">
          {inquiry.email}
        </a>
        {inquiry.phone && (
          <a
            href={`tel:${inquiry.phone.replace(/[^\d+]/g, "")}`}
            className="font-medium text-blue-800 underline underline-offset-2 hover:text-blue-950"
          >
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
