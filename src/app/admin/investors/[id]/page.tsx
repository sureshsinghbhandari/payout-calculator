import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminBreadcrumb, AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { InvestmentCard } from "@/components/admin/investors/InvestmentCard";
import { InvestorAccess } from "@/components/admin/investors/InvestorAccess";
import { InvestorDetailsForm } from "@/components/admin/investors/InvestorDetailsForm";
import {
  formatTimestamp,
  investorLoginState,
  isInvestorIdLike,
  LOGIN_STATE_BADGES,
} from "@/components/admin/investors/fields";
import { successNotice, textLink } from "@/components/admin/investors/ui";
import { toPublicAdmin, toPublicInvestor, type Investor } from "@/lib/accounts";
import { formatDollars } from "@/lib/format";
import { inquiryReference, isInquiryId } from "@/lib/inquiry";
import { getInvestor, isAccountStorageConfigured } from "@/lib/server/accounts-store";
import { requireAdminPage } from "@/lib/server/auth";
import { MIN_USER_PASSWORD_LENGTH } from "@/lib/server/passwords";

export const metadata: Metadata = {
  title: "Investor | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function InvestorPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <InvestorContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const BREADCRUMB_BASE = [
  { label: "Admin", href: "/admin/inquiries" },
  { label: "Investors", href: "/admin/investors" },
];

/** The investor (null when missing or unreadable) and the time it was read. */
async function loadInvestor(id: string): Promise<{ investor: Investor | null; loadFailed: boolean; readAtMs: number }> {
  if (!isAccountStorageConfigured() || !isInvestorIdLike(id)) return { investor: null, loadFailed: false, readAtMs: 0 };
  try {
    return { investor: await getInvestor(id), loadFailed: false, readAtMs: Date.now() };
  } catch (error) {
    console.error("Reading investor failed", error);
    return { investor: null, loadFailed: true, readAtMs: 0 };
  }
}

async function InvestorContent({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  await connection();
  const admin = await requireAdminPage("investors.manage");
  const user = toPublicAdmin(admin);
  const { id } = await params;
  const created = (await searchParams).created === "1";

  const { investor, loadFailed, readAtMs } = await loadInvestor(id);

  if (!investor) {
    return (
      <AdminFrame user={user}>
        <AdminBreadcrumb items={[...BREADCRUMB_BASE, { label: "Not found" }]} />
        <h1 className="mb-6 text-2xl font-semibold text-slate-900">Investor</h1>
        <AdminCard>
          <p role="alert" className="text-sm font-medium text-slate-800">
            {!isAccountStorageConfigured()
              ? "Account storage is not connected, so investors cannot be shown."
              : loadFailed
                ? "This investor could not be loaded. Reload the page to try again."
                : "This investor could not be found."}
          </p>
          <Link href="/admin/investors" className={`mt-4 inline-block text-sm ${textLink}`}>
            Back to investors
          </Link>
        </AdminCard>
      </AdminFrame>
    );
  }

  const login = investorLoginState(investor, readAtMs);
  // Only safe fields go to client components (no password or token hashes).
  const pub = toPublicInvestor(investor);
  const totalInvested = pub.investments.reduce((sum, i) => sum + i.principal, 0);

  return (
    <AdminFrame user={user}>
      <AdminBreadcrumb items={[...BREADCRUMB_BASE, { label: pub.name }]} />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">{pub.name}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${LOGIN_STATE_BADGES[login.key]}`}>
              {login.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Username <span className="font-mono text-slate-800">{pub.username}</span> · Investor since{" "}
            {formatTimestamp(pub.createdAt)}
            {pub.sourceInquiryId && (
              <>
                {" "}
                ·{" "}
                <Link href="/admin/inquiries" className={textLink}>
                  View source inquiry
                </Link>
                {isInquiryId(pub.sourceInquiryId) && (
                  <span className="text-slate-500"> (Ref {inquiryReference(pub.sourceInquiryId)})</span>
                )}
              </>
            )}
          </p>
        </div>
        <Link href="/admin/investors" className={`text-sm ${textLink}`}>
          Back to investors
        </Link>
      </div>

      {created && (
        <div role="status" className={`mb-6 ${successNotice}`}>
          <p className="font-semibold">Investor created from the inquiry.</p>
          {login.key === "not-set-up" && (
            <p className="mt-1 font-normal">
              {pub.name} cannot sign in yet. Under Sign-in, set a temporary password or create a setup link and give it to
              them.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="investor-contact-heading">
          <AdminCard>
            <h2 id="investor-contact-heading" className="mb-5 text-base font-semibold text-slate-900">
              Contact details
            </h2>
            <InvestorDetailsForm
              investorId={pub.id}
              current={{ name: pub.name, email: pub.email, phone: pub.phone, username: pub.username }}
            />
          </AdminCard>
        </section>

        <section aria-labelledby="investor-signin-heading">
          <AdminCard>
            <h2 id="investor-signin-heading" className="text-base font-semibold text-slate-900">
              Sign-in
            </h2>
            <p className="mb-5 mt-1 text-sm text-slate-600">
              Status: <span className="font-semibold text-slate-900">{login.label}</span>
              {login.detail && <> · {login.detail}</>}
            </p>
            <InvestorAccess
              investorId={pub.id}
              investorName={pub.name}
              active={pub.active}
              hasPassword={pub.hasPassword}
              minPasswordLength={MIN_USER_PASSWORD_LENGTH}
            />
          </AdminCard>
        </section>
      </div>

      <section aria-labelledby="investor-investments-heading" className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="investor-investments-heading" className="text-lg font-semibold text-slate-900">
            Investments
          </h2>
          <p className="text-sm text-slate-600">
            {pub.investments.length} {pub.investments.length === 1 ? "investment" : "investments"}, total{" "}
            {formatDollars(totalInvested)}
          </p>
        </div>
        {pub.investments.length === 0 ? (
          <AdminCard>
            <p className="text-sm text-slate-600">No investments recorded.</p>
          </AdminCard>
        ) : (
          <ol className="space-y-4">
            {pub.investments.map((investment, index) => (
              <InvestmentCard key={investment.id} investment={investment} number={index + 1} />
            ))}
          </ol>
        )}
      </section>
    </AdminFrame>
  );
}
