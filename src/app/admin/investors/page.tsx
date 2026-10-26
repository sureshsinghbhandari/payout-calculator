import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminBreadcrumb, AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { investorLoginState, isoDay, LOGIN_STATE_BADGES } from "@/components/admin/investors/fields";
import { textLink } from "@/components/admin/investors/ui";
import { toPublicAdmin, type Investor } from "@/lib/accounts";
import { formatDollars, formatIsoDate } from "@/lib/format";
import { isAccountStorageConfigured, listInvestors } from "@/lib/server/accounts-store";
import { requireAdminPage } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Investors | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

export default function InvestorsPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <InvestorsContent />
    </Suspense>
  );
}

/** All investors (null when they could not be loaded) and the time they were read. */
async function loadInvestors(): Promise<{ investors: Investor[] | null; readAtMs: number }> {
  let investors: Investor[] | null = null;
  try {
    investors = await listInvestors();
  } catch (error) {
    console.error("Listing investors failed", error);
  }
  return { investors, readAtMs: Date.now() };
}

async function InvestorsContent() {
  await connection();
  const admin = await requireAdminPage("investors.manage");
  const configured = isAccountStorageConfigured();
  const { investors, readAtMs: nowMs } = configured ? await loadInvestors() : { investors: null, readAtMs: 0 };
  const sorted = (investors ?? [])
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

  return (
    <AdminFrame user={toPublicAdmin(admin)}>
      <AdminBreadcrumb items={[{ label: "Admin", href: "/admin/inquiries" }, { label: "Investors" }]} />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Investors</h1>
          <p className="mt-1 text-sm text-slate-600">
            {investors
              ? `${investors.length} ${investors.length === 1 ? "investor" : "investors"}, newest first. `
              : ""}
            Investors are added by converting a contacted inquiry.
          </p>
        </div>
        <Link href="/admin/inquiries" className={`text-sm ${textLink}`}>
          Go to inquiries
        </Link>
      </div>

      {!configured ? (
        <AdminCard>
          <p className="text-sm text-slate-700">Account storage is not connected, so investors cannot be stored or shown.</p>
        </AdminCard>
      ) : !investors ? (
        <AdminCard>
          <p role="alert" className="text-sm font-medium text-red-700">
            Investors could not be loaded. Reload the page to try again.
          </p>
        </AdminCard>
      ) : sorted.length === 0 ? (
        <AdminCard>
          <p className="text-sm text-slate-600">
            No investors yet. To add one, open{" "}
            <Link href="/admin/inquiries" className={textLink}>
              Inquiries
            </Link>
            , mark an inquiry as contacted, then select Convert to investor.
          </p>
        </AdminCard>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 md:hidden">Swipe the table sideways to see every column.</p>
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div
              className="relative overflow-x-auto rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
              tabIndex={0}
              role="region"
              aria-label="Investors table, scrolls horizontally"
            >
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <caption className="sr-only">Investors, newest first</caption>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                    <th scope="col" className="px-4 py-3 text-left font-semibold sm:pl-6">
                      Name
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold">
                      Username
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold">
                      Email
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">
                      Investments
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">
                      Total invested
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold">
                      Login
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold sm:pr-6">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="text-slate-800">
                  {sorted.map((investor) => {
                    const login = investorLoginState(investor, nowMs);
                    const total = investor.investments.reduce((sum, i) => sum + i.principal, 0);
                    return (
                      <tr key={investor.id} className="border-b border-slate-100 last:border-b-0">
                        <th scope="row" className="px-4 py-3 text-left font-medium sm:pl-6">
                          <Link href={`/admin/investors/${encodeURIComponent(investor.id)}`} className={textLink}>
                            {investor.name}
                          </Link>
                        </th>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">{investor.username}</td>
                        <td className="max-w-[16rem] truncate px-4 py-3" title={investor.email}>
                          {investor.email || "–"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{investor.investments.length}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatDollars(total)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${LOGIN_STATE_BADGES[login.key]}`}
                          >
                            {login.label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 sm:pr-6">{formatIsoDate(isoDay(investor.createdAt))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </AdminFrame>
  );
}
