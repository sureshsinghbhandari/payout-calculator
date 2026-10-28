import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { revealAccountNumberAction } from "@/app/admin/investors/request-actions";
import { AdminBreadcrumb, AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { BankDetailsSummary } from "@/components/BankDetailsSummary";
import { ChangeRequestHistory } from "@/components/ChangeRequestHistory";
import { ChangeRequestReview } from "@/components/admin/investors/ChangeRequestReview";
import { DocumentVault } from "@/components/admin/investors/DocumentVault";
import { InvestmentCard } from "@/components/admin/investors/InvestmentCard";
import { InvestorAccess } from "@/components/admin/investors/InvestorAccess";
import { InvestorSignInInfo } from "@/components/admin/investors/InvestorSignInInfo";
import { InvestorDetailsForm } from "@/components/admin/investors/InvestorDetailsForm";
import {
  formatTimestamp,
  investorLoginState,
  isInvestorIdLike,
  LOGIN_STATE_BADGES,
} from "@/components/admin/investors/fields";
import { errorNotice, primaryButton, successNotice, textLink } from "@/components/admin/investors/ui";
import { can, toPublicAdmin, toPublicInvestor, type Investor } from "@/lib/accounts";
import { toPublicDocument, type PublicDocument } from "@/lib/documents";
import { formatDollars } from "@/lib/format";
import { inquiryReference, isInquiryId } from "@/lib/inquiry";
import { todayEastern } from "@/lib/investments";
import { getInvestor, isAccountStorageConfigured } from "@/lib/server/accounts-store";
import { paymentConfirmationBlocker } from "@/lib/server/payout-notices";
import { requireAdminPage } from "@/lib/server/auth";
import { bankDetailsView, changeRequestViews } from "@/lib/server/change-requests";
import { documentFolder, isDocumentStorageConfigured, listDocuments } from "@/lib/server/documents-store";
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

/** The investor's documents, or null when they could not be loaded. */
async function loadDocuments(investorId: string): Promise<PublicDocument[] | null> {
  try {
    return (await listDocuments(investorId)).map(toPublicDocument);
  } catch (error) {
    console.error("Listing investor documents failed", error);
    return null;
  }
}

async function InvestorContent({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  await connection();
  const admin = await requireAdminPage("investors.manage");
  const user = toPublicAdmin(admin);
  const { id } = await params;
  const query = await searchParams;
  const created = query.created === "1";
  const added = query.added === "1";
  const renewed = query.renewed === "1";
  const decided = query.decided === "approved" || query.decided === "rejected" ? query.decided : null;

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
  const today = todayEastern();
  const numberOf = (investmentId: string | null) => {
    const index = investmentId ? pub.investments.findIndex((i) => i.id === investmentId) : -1;
    return index === -1 ? null : index + 1;
  };
  // Bank details and change requests are decrypted here and masked before they reach the browser.
  const bank = bankDetailsView(investor);
  const requests = changeRequestViews(investor);
  const pendingRequests = requests.filter((r) => r.status === "pending");
  const pastRequests = requests.filter((r) => r.status !== "pending");
  const documents = isDocumentStorageConfigured() ? await loadDocuments(investor.id) : null;

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

      {(added || renewed) && (
        <div role="status" className={`mb-6 ${successNotice}`}>
          {renewed ? "Investment renewed. The new investment is listed under Investments." : "Investment added."}
        </div>
      )}

      {decided && (
        <div role="status" className={`mb-6 ${successNotice}`}>
          {decided === "approved"
            ? "Request approved. The new details are saved."
            : "Request not approved. The investor can see this, and your reason, in the portal."}
        </div>
      )}

      {pendingRequests.length > 0 && !decided && (
        <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          {pub.name} asked to change their details.{" "}
          <a href="#change-requests" className={textLink}>
            Review {pendingRequests.length === 1 ? "the request" : `${pendingRequests.length} requests`}
          </a>
        </p>
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
            <InvestorSignInInfo username={pub.username} hasPassword={pub.hasPassword} active={pub.active} />
            <InvestorAccess
              investorId={pub.id}
              investorName={pub.name}
              active={pub.active}
              hasPassword={pub.hasPassword}
              twoStepEnabled={pub.twoStepEnabled}
              minPasswordLength={MIN_USER_PASSWORD_LENGTH}
            />
          </AdminCard>
        </section>
      </div>

      <section id="change-requests" aria-labelledby="investor-bank-heading" className="mt-6 scroll-mt-6">
        <AdminCard>
          <h2 id="investor-bank-heading" className="text-base font-semibold text-slate-900">
            Bank details and change requests
          </h2>
          <p className="mb-5 mt-1 text-sm text-slate-600">
            Investors ask for changes to their contact and bank details in the portal. Changes apply once you approve them.
            Account numbers are stored encrypted; only the last 4 digits are shown unless you select Show.
          </p>

          {bank.state === "ok" ? (
            <BankDetailsSummary details={bank.details} reveal={revealAccountNumberAction.bind(null, pub.id, null)} />
          ) : bank.state === "unreadable" ? (
            <p role="alert" className={errorNotice}>
              The bank details on file (account ending {bank.accountLast4}) could not be read. Ask {pub.name} to send them
              again from the portal.
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              No bank details yet. {pub.name} can send them from Your details in the investor portal.
            </p>
          )}

          {pendingRequests.length > 0 && (
            <div className="mt-6 border-t border-slate-200 pt-6">
              <h3 className="mb-4 text-sm font-semibold text-slate-900">Waiting for your review</h3>
              <ul className="space-y-6">
                {pendingRequests.map((request) => (
                  <li key={request.id} className="rounded-xl border border-slate-200 p-4 sm:p-5">
                    <ChangeRequestReview
                      investorId={pub.id}
                      request={request}
                      current={{ email: pub.email, phone: pub.phone, bank: bank.state === "ok" ? bank.details : null }}
                      reveal={request.bank ? revealAccountNumberAction.bind(null, pub.id, request.id) : undefined}
                      from="investor"
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pastRequests.length > 0 && (
            <details className="mt-6 border-t border-slate-200 pt-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                Earlier requests ({pastRequests.length})
              </summary>
              <ChangeRequestHistory requests={pastRequests} audience="admin" />
            </details>
          )}
        </AdminCard>
      </section>

      <section aria-labelledby="investor-investments-heading" className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="investor-investments-heading" className="text-lg font-semibold text-slate-900">
              Investments
            </h2>
            <p className="text-sm text-slate-600">
              {pub.investments.length} {pub.investments.length === 1 ? "investment" : "investments"}, total{" "}
              {formatDollars(totalInvested)}
            </p>
          </div>
          <Link href={`/admin/investors/${encodeURIComponent(pub.id)}/add-investment`} className={primaryButton}>
            Add investment
          </Link>
        </div>
        {pub.investments.length === 0 ? (
          <AdminCard>
            <p className="text-sm text-slate-600">No investments recorded.</p>
          </AdminCard>
        ) : (
          <ol className="space-y-4">
            {pub.investments.map((investment, index) => (
              <InvestmentCard
                key={investment.id}
                investorId={pub.id}
                investment={investment}
                number={index + 1}
                today={today}
                canManagePayouts={can(admin.role, "payouts.manage")}
                confirmationBlocker={paymentConfirmationBlocker(investor)}
                renewedFromNumber={numberOf(investment.renewedFromId)}
                renewedByNumber={numberOf(pub.investments.find((i) => i.renewedFromId === investment.id)?.id ?? null)}
              />
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="investor-documents-heading" className="mt-8">
        <h2 id="investor-documents-heading" className="mb-3 text-lg font-semibold text-slate-900">
          Documents
        </h2>
        <AdminCard>
          {!isDocumentStorageConfigured() ? (
            <p className="text-sm text-slate-700">Storage is not connected, so documents cannot be uploaded.</p>
          ) : documents === null ? (
            <p role="alert" className="text-sm font-medium text-red-700">
              Documents could not be loaded. Reload the page to try again.
            </p>
          ) : (
            <DocumentVault
              investorId={pub.id}
              investorName={pub.name}
              uploadFolder={documentFolder(pub.id)}
              documents={documents}
            />
          )}
        </AdminCard>
      </section>
    </AdminFrame>
  );
}
