import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { revealAccountNumberAction } from "@/app/admin/investors/request-actions";
import { AdminBreadcrumb, AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { ChangeRequestReview } from "@/components/admin/investors/ChangeRequestReview";
import { successNotice, textLink } from "@/components/admin/investors/ui";
import { ChangeRequestHistory } from "@/components/ChangeRequestHistory";
import { toPublicAdmin, type Investor } from "@/lib/accounts";
import { isAccountStorageConfigured, listInvestors } from "@/lib/server/accounts-store";
import { requireAdminPage } from "@/lib/server/auth";
import { bankDetailsView, changeRequestViews } from "@/lib/server/change-requests";

export const metadata: Metadata = {
  title: "Change requests | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** How many recently decided requests to list. */
const RECENT_MAX = 20;

export default function ChangeRequestsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <ChangeRequestsContent searchParams={searchParams} />
    </Suspense>
  );
}

/** Contact and bank detail changes investors asked for, oldest pending first. */
async function ChangeRequestsContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const admin = await requireAdminPage("investors.manage");
  const { decided } = await searchParams;

  let investors: Investor[] | null = null;
  if (isAccountStorageConfigured()) {
    try {
      investors = await listInvestors();
    } catch (error) {
      console.error("Listing investors for change requests failed", error);
    }
  }

  // Every request with its investor; decrypted and masked on the server.
  const all = (investors ?? []).flatMap((investor) =>
    changeRequestViews(investor).map((request) => ({ investor, request })),
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
          { label: "Change requests" },
        ]}
      />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Change requests</h1>
          <p className="mt-1 text-sm text-slate-600">
            Changes to contact and bank details that investors asked for in the portal. Approving a request applies it.
          </p>
        </div>
        <Link href="/admin/investors" className={`text-sm ${textLink}`}>
          Back to investors
        </Link>
      </div>

      {(decided === "approved" || decided === "rejected") && (
        <div role="status" className={`mb-6 ${successNotice}`}>
          {decided === "approved"
            ? "Request approved. The new details are saved."
            : "Request not approved. The investor can see this, and your reason, in the portal."}
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
                {pending.map(({ investor, request }) => {
                  const bank = bankDetailsView(investor);
                  return (
                    <li key={request.id}>
                      <AdminCard>
                        <p className="mb-4 text-sm text-slate-600">
                          From{" "}
                          <Link href={`/admin/investors/${encodeURIComponent(investor.id)}`} className={textLink}>
                            {investor.name}
                          </Link>{" "}
                          <span className="font-mono text-xs text-slate-500">({investor.username})</span>
                        </p>
                        <ChangeRequestReview
                          investorId={investor.id}
                          request={request}
                          current={{
                            email: investor.email,
                            phone: investor.phone,
                            bank: bank.state === "ok" ? bank.details : null,
                          }}
                          reveal={request.bank ? revealAccountNumberAction.bind(null, investor.id, request.id) : undefined}
                          from="requests"
                        />
                      </AdminCard>
                    </li>
                  );
                })}
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
                      <ChangeRequestHistory requests={[request]} audience="admin" />
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
