import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminBreadcrumb, AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { AddInvestmentForm } from "@/components/admin/investors/AddInvestmentForm";
import { isInvestorIdLike, type PlanField } from "@/components/admin/investors/fields";
import { textLink } from "@/components/admin/investors/ui";
import { toPublicAdmin, type Investment, type Investor } from "@/lib/accounts";
import { DEFAULT_PAYOUT_TYPE } from "@/lib/config";
import { formatCents, formatDollars, formatIsoDate, formatPercent, formatYears } from "@/lib/format";
import { isMatured, maturityDate, renewalOf, scheduleOrNull, todayEastern } from "@/lib/investments";
import { FREQUENCY_LABELS, PAYOUT_TYPE_LABELS } from "@/lib/payout";
import { isOfferedFrequency, type ProductSettings } from "@/lib/products";
import type { RateTable } from "@/lib/rates";
import { getInvestor, isAccountStorageConfigured } from "@/lib/server/accounts-store";
import { requireAdminPage } from "@/lib/server/auth";
import { getCurrentProducts } from "@/lib/server/products-store";
import { getCurrentRates } from "@/lib/server/rates-store";

export const metadata: Metadata = {
  title: "Add investment | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Adds another investment to an investor; with ?renew=<investment id>, renews a matured investment. */
export default function AddInvestmentPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AddInvestmentContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** Why the renewal cannot be offered, or null when it can. */
function renewBlockedReason(investor: Investor, source: Investment | undefined, today: string): string | null {
  if (!source) return "The investment to renew could not be found.";
  const schedule = scheduleOrNull(source);
  if (!schedule) return "The payout schedule of this investment could not be calculated, so it cannot be renewed.";
  if (!isMatured(schedule, today)) {
    return `This investment can be renewed once its term ends on ${formatIsoDate(maturityDate(schedule))}.`;
  }
  if (renewalOf(source, investor.investments)) return "This investment has already been renewed.";
  return null;
}

/** The value when it is still on offer, else the current default. */
function validOr(value: number, allowed: readonly number[], fallback: number): string {
  return String(allowed.includes(value) ? value : fallback);
}

async function AddInvestmentContent({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  await connection();
  const admin = await requireAdminPage("investors.manage");
  const user = toPublicAdmin(admin);
  const { id } = await params;
  const renewParam = (await searchParams).renew;
  const renewId = typeof renewParam === "string" && isInvestorIdLike(renewParam) ? renewParam : null;
  const today = todayEastern();

  let investor: Investor | null = null;
  let rates: RateTable | null = null;
  let products: ProductSettings | null = null;
  let message: string | null = null;
  if (!isAccountStorageConfigured()) {
    message = "Account storage is not connected, so investments cannot be added.";
  } else if (!isInvestorIdLike(id)) {
    message = "This investor could not be found.";
  } else {
    try {
      [investor, rates, products] = await Promise.all([getInvestor(id), getCurrentRates(), getCurrentProducts()]);
      if (!investor) message = "This investor could not be found.";
    } catch (error) {
      console.error("Loading investor for a new investment failed", error);
      message =
        "The investor, the current interest rates or the amounts and terms on offer could not be loaded. Reload the page to try again.";
    }
  }

  const source = investor && renewId ? investor.investments.find((i) => i.id === renewId) : undefined;
  if (investor && renewId && !message) message = renewBlockedReason(investor, source, today);
  const title = renewId ? "Renew investment" : "Add investment";
  const breadcrumb = [
    { label: "Admin", href: "/admin/inquiries" },
    { label: "Investors", href: "/admin/investors" },
    ...(investor ? [{ label: investor.name, href: `/admin/investors/${encodeURIComponent(investor.id)}` }] : []),
    { label: title },
  ];

  if (!investor || !rates || !products || message) {
    return (
      <AdminFrame user={user}>
        <AdminBreadcrumb items={breadcrumb} />
        <h1 className="mb-6 text-2xl font-semibold text-slate-900">{title}</h1>
        <AdminCard>
          <p role="alert" className="text-sm font-medium text-slate-800">
            {message ?? "The current interest rates could not be loaded. Reload the page to try again."}
          </p>
          <Link
            href={investor ? `/admin/investors/${encodeURIComponent(investor.id)}` : "/admin/investors"}
            className={`mt-4 inline-block text-sm ${textLink}`}
          >
            {investor ? `Back to ${investor.name}` : "Back to investors"}
          </Link>
        </AdminCard>
      </AdminFrame>
    );
  }

  const sourceSchedule = source ? scheduleOrNull(source) : null;
  const defaults: Record<PlanField, string> = source
    ? {
        principal: validOr(source.principal, products.amounts, products.defaultAmount),
        investmentDate: sourceSchedule ? maturityDate(sourceSchedule) : today,
        lockInYears: validOr(source.lockInYears, products.terms, products.defaultTerm),
        frequency: isOfferedFrequency(products, source.frequency) ? source.frequency : products.defaultFrequency,
        payoutType: source.payoutType,
      }
    : {
        principal: String(products.defaultAmount),
        investmentDate: today,
        lockInYears: String(products.defaultTerm),
        frequency: products.defaultFrequency,
        payoutType: DEFAULT_PAYOUT_TYPE,
      };
  const sourceDetails =
    source && sourceSchedule
      ? [
          { label: "Investment amount", value: formatDollars(source.principal) },
          { label: "Planned investment date", value: formatIsoDate(source.investmentDate) },
          { label: "Term locked", value: formatYears(source.lockInYears) },
          { label: "Payout term", value: FREQUENCY_LABELS[source.frequency] },
          { label: "Payout type", value: PAYOUT_TYPE_LABELS[source.payoutType] },
          { label: "Rate at the time", value: formatPercent(source.annualRatePercent) },
          { label: "Total amount paid", value: formatCents(sourceSchedule.totals.payoutCents) },
          { label: "Matured", value: formatIsoDate(maturityDate(sourceSchedule)) },
        ]
      : [];

  return (
    <AdminFrame user={user}>
      <AdminBreadcrumb items={breadcrumb} />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          {title} for {investor.name}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {source
            ? "Creates a new investment for the next term. The current rate for the chosen payout term is fixed on it. The matured investment stays as it is."
            : "Adds another investment to this investor. The current rate for the chosen payout term is fixed on it."}
        </p>
      </div>

      {source && (
        <section
          aria-labelledby="renew-source-heading"
          className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6"
        >
          <h2 id="renew-source-heading" className="text-base font-semibold text-slate-900">
            Matured investment
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            {sourceDetails.map((item) => (
              <div key={item.label}>
                <dt className="text-xs text-slate-500">{item.label}</dt>
                <dd className="font-medium tabular-nums text-slate-900">{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <AddInvestmentForm investorId={investor.id} renewedFromId={source?.id ?? null} defaults={defaults} rates={rates} products={products} />
    </AdminFrame>
  );
}
