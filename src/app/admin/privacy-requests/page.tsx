import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminBreadcrumb, AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { PrivacyRequestReview } from "@/components/admin/investors/PrivacyRequestReview";
import { successNotice, textLink } from "@/components/admin/investors/ui";
import { PrivacyRequestHistory } from "@/components/PrivacyRequestHistory";
import { toPublicAdmin, type Investor } from "@/lib/accounts";
import { sortPrivacyRequests } from "@/lib/privacy-requests";
import { isAccountStorageConfigured, listInvestors } from "@/lib/server/accounts-store";
import { requireAdminPage } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Privacy requests | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** How many recently decided requests to list. */
const RECENT_MAX = 20;

export default function PrivacyRequestsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <PrivacyRequestsContent searchParams={searchParams} />
    </Suspense>
  );
}

/** Investors asking for a copy of their data or for their account to be deleted, oldest pending first. */
async function PrivacyRequestsContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const admin = await requireAdminPage("privacy.manage");
  const { decided } = await searchParams;

  let investors: Investor[] | null = null;
  if (isAccountStorageConfigured()) {
    try {
      investors = await listInvestors();
    } catch (error) {
      console.error("Listing investors for privacy requests failed", error);
    }
  }

  const all = (investors ?? []).flatMap((investor) =>
    sortPrivacyRequests(investor.privacyRequests).map((request) => ({ investor, request })),
  );
  const pending = all
    .filter((x) => x.request.status === "pending")
    .sort((a, b) => (a.request.requestedAt < b.request.requestedAt ? -1 : 1));
  const recent = all
    .filter((x) => x.request.status !== "pending")
    .sort((a, b) => ((a.request.decidedAt ?? "") < (b.request.decidedAt ?? "") ? 1 : -1))
    .slice(0, RECENT_MAX);

  return (
    <AdminFrame user={toPublicAdmin(admin)}>
      <AdminBreadcrumb
        items={[
          { label: "Admin", href: "/admin/inquiries" },
          { label: "Investors", href: "/admin/investors" },
          { label: "Privacy requests" },
        ]}
      />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Privacy requests</h1>
          <p className="mt-1 text-sm text-slate-600">
            Investors asking for a copy of their data, or for their account to be deleted. There is no automatic
            export or deletion: handle the request yourself (for example, email the data, or remove the account in
            Investors), then mark it fulfilled or declined here.
          </p>
        </div>
        <Link href="/admin/investors" className={`text-sm ${textLink}`}>
          Back to investors
        </Link>
      </div>

      {(decided === "fulfilled" || decided === "declined") && (
        <div role="status" className={`mb-6 ${successNotice}`}>
          {decided === "fulfilled"
            ? "Request marked as fulfilled."
            : "Request declined. The investor can see this, and your reason, in the portal."}
        </div>
      )}

      {!isAccountStorageConfigured() ? (
        <AdminCard>
          <p className="text-sm text-slate-700">Account storage is not connected, so requests cannot be shown.</p>
        </AdminCard>
      ) : !investors ? (
        <AdminCard>
          <p role="alert" className="text-sm font-medium text-red-700">
            Requests could not be loaded. Reload the page to try again.
          </p>
        </AdminCard>
      ) : (
        <>
          <section aria-labelledby="pending-heading">
            <h2 id="pending-heading" className="mb-3 text-lg font-semibold text-slate-900">
              Waiting for review ({pending.length})
            </h2>
            {pending.length === 0 ? (
              <AdminCard>
                <p className="text-sm text-slate-600">Nothing to review. New requests from investors show here.</p>
              </AdminCard>
            ) : (
              <ul className="space-y-4">
                {pending.map(({ investor, request }) => (
                  <li key={request.id}>
                    <AdminCard>
                      <p className="mb-4 text-sm text-slate-600">
                        From{" "}
                        <Link href={`/admin/investors/${encodeURIComponent(investor.id)}`} className={textLink}>
                          {investor.name}
                        </Link>{" "}
                        <span className="font-mono text-xs text-slate-500">({investor.username})</span>
                      </p>
                      <PrivacyRequestReview investorId={investor.id} request={request} />
                    </AdminCard>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {recent.length > 0 && (
            <section aria-labelledby="recent-heading" className="mt-10">
              <h2 id="recent-heading" className="mb-3 text-lg font-semibold text-slate-900">
                Recently reviewed
              </h2>
              <AdminCard>
                <ul className="divide-y divide-slate-200">
                  {recent.map(({ investor, request }) => (
                    <li key={request.id} className="py-1">
                      <p className="pt-2 text-xs font-semibold text-slate-600">
                        <Link href={`/admin/investors/${encodeURIComponent(investor.id)}`} className={textLink}>
                          {investor.name}
                        </Link>
                      </p>
                      <PrivacyRequestHistory requests={[request]} audience="admin" />
                    </li>
                  ))}
                </ul>
              </AdminCard>
            </section>
          )}
        </>
      )}
    </AdminFrame>
  );
}
