import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminBreadcrumb, AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { ConvertInquiryForm } from "@/components/admin/investors/ConvertInquiryForm";
import { formatTimestamp, suggestUsername, type ConvertField } from "@/components/admin/investors/fields";
import { textLink } from "@/components/admin/investors/ui";
import { toPublicAdmin, type Investor } from "@/lib/accounts";
import { formatCents, formatDollars, formatIsoDate, formatPercent, formatYears } from "@/lib/format";
import { inquiryReference, isInquiryId, type StoredInquiry } from "@/lib/inquiry";
import { FREQUENCY_LABELS, PAYOUT_TYPE_LABELS } from "@/lib/payout";
import { isOfferedAmount, isOfferedFrequency, isOfferedTerm, type ProductSettings } from "@/lib/products";
import type { RateTable } from "@/lib/rates";
import { isAccountStorageConfigured, listInvestors } from "@/lib/server/accounts-store";
import { requireAdminPage } from "@/lib/server/auth";
import { getInquiry } from "@/lib/server/inquiry-store";
import { getCurrentProducts } from "@/lib/server/products-store";
import { getCurrentRates } from "@/lib/server/rates-store";

export const metadata: Metadata = {
  title: "Convert inquiry | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

type Params = Promise<{ id: string }>;

export default function ConvertInquiryPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <ConvertContent params={params} />
    </Suspense>
  );
}

const BREADCRUMB = [
  { label: "Admin", href: "/admin/inquiries" },
  { label: "Inquiries", href: "/admin/inquiries" },
  { label: "Convert to investor" },
];

/** Why an inquiry cannot be converted, or null when it can. */
function blockedReason(inquiry: StoredInquiry, existing: Investor | undefined): { text: string; investorId?: string } | null {
  if (existing) {
    return { text: `This inquiry has already been converted. The investor is ${existing.name}.`, investorId: existing.id };
  }
  switch (inquiry.status) {
    case "contacted":
      return null;
    case "converted":
      return { text: "This inquiry has already been converted to an investor.", investorId: inquiry.investorId };
    case "deleted":
      return {
        text: "This inquiry is deleted. Restore it from Deleted inquiries and mark it as contacted before converting it.",
      };
    default:
      return {
        text: "Only inquiries marked as contacted can be converted. Contact the visitor first, then select Mark as contacted on the Inquiries page.",
      };
  }
}

async function ConvertContent({ params }: { params: Params }) {
  await connection();
  const admin = await requireAdminPage("inquiries.convert");
  const user = toPublicAdmin(admin);
  const { id } = await params;

  let message: string | null = null;
  let inquiry: StoredInquiry | null = null;
  let investors: Investor[] = [];
  let rates: RateTable | null = null;
  let products: ProductSettings | null = null;

  if (!isAccountStorageConfigured()) {
    message = "Account storage is not connected, so inquiries cannot be converted.";
  } else if (!isInquiryId(id)) {
    message = "This inquiry could not be found.";
  } else {
    try {
      [inquiry, investors, rates, products] = await Promise.all([
        getInquiry(id),
        listInvestors(),
        getCurrentRates(),
        getCurrentProducts(),
      ]);
      if (!inquiry) message = "This inquiry could not be found.";
    } catch (error) {
      console.error("Loading inquiry for conversion failed", error);
      message = "The inquiry could not be loaded. Reload the page to try again.";
    }
  }

  const loaded = inquiry;
  const existing = loaded ? investors.find((i) => i.sourceInquiryId === loaded.id) : undefined;
  const blocked = loaded ? blockedReason(loaded, existing) : null;

  if (!inquiry || !rates || !products || message || blocked) {
    return (
      <AdminFrame user={user}>
        <AdminBreadcrumb items={BREADCRUMB} />
        <h1 className="mb-6 text-2xl font-semibold text-slate-900">Convert to investor</h1>
        <AdminCard>
          <p role="alert" className="text-sm font-medium text-slate-800">
            {message ??
              blocked?.text ??
              "The current interest rates or the amounts and terms on offer could not be loaded. Reload the page to try again."}
          </p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {blocked?.investorId && (
              <Link href={`/admin/investors/${encodeURIComponent(blocked.investorId)}`} className={textLink}>
                View investor
              </Link>
            )}
            <Link href="/admin/inquiries" className={textLink}>
              Back to inquiries
            </Link>
          </div>
        </AdminCard>
      </AdminFrame>
    );
  }

  const { plan } = inquiry;
  const taken = new Set(investors.map((i) => i.username));
  const defaults: Record<ConvertField, string> = {
    name: inquiry.name,
    email: inquiry.email,
    phone: inquiry.phone,
    username: suggestUsername(inquiry.email, inquiry.name, taken),
    // A plan value no longer on offer starts at the current default instead.
    principal: String(isOfferedAmount(products, plan.principal) ? plan.principal : products.defaultAmount),
    investmentDate: plan.investmentDate,
    lockInYears: String(isOfferedTerm(products, plan.lockInYears) ? plan.lockInYears : products.defaultTerm),
    frequency: isOfferedFrequency(products, plan.frequency) ? plan.frequency : products.defaultFrequency,
    payoutType: plan.payoutType,
  };
  const snapshot = [
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
    <AdminFrame user={user}>
      <AdminBreadcrumb items={BREADCRUMB} />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Convert to investor</h1>
        <p className="mt-1 text-sm text-slate-600">
          Creates an investor account with this investment. The investor can sign in after you set a temporary password or
          create a setup link.
        </p>
      </div>

      <section
        aria-labelledby="inquiry-summary-heading"
        className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6"
      >
        <h2 id="inquiry-summary-heading" className="text-base font-semibold text-slate-900">
          Inquiry from {inquiry.name}
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Received {formatTimestamp(inquiry.createdAt)} · Ref {inquiryReference(inquiry.id)}
        </p>
        {inquiry.message && (
          <p className="mt-3 whitespace-pre-wrap rounded-lg bg-white p-3 text-sm text-slate-800">{inquiry.message}</p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          {snapshot.map((item) => (
            <div key={item.label}>
              <dt className="text-xs text-slate-500">{item.label}</dt>
              <dd className="font-medium tabular-nums text-slate-900">{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <ConvertInquiryForm inquiryId={inquiry.id} defaults={defaults} rates={rates} products={products} />
    </AdminFrame>
  );
}
