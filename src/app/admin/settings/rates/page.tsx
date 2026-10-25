import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { LockedRates, RatesEditor, RatesHistory } from "@/components/admin/RatesEditor";
import { adminConfig, isAdmin, isRatesUnlocked, RATES_UNLOCK_SECONDS } from "@/lib/server/admin-auth";
import { isRateStorageConfigured, readStoredRatesForAdmin, type StoredRates } from "@/lib/server/rates-store";

export const metadata: Metadata = {
  title: "Interest rates | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function RatesSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <RatesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function RatesContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  // Sign-in only happens on /admin (behind the firewall rate limit).
  if (!adminConfig().ok || !(await isAdmin())) redirect("/admin");

  const savedNotice = (await searchParams).saved === "1";
  const unlocked = await isRatesUnlocked();

  let stored: StoredRates | null = null;
  let storedInvalid = false;
  try {
    ({ stored, invalid: storedInvalid } = await readStoredRatesForAdmin());
  } catch (error) {
    console.error("Reading rates failed", error);
  }

  return (
    <AdminFrame signedIn>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-slate-500">
        <Link href="/admin/inquiries" className="hover:text-slate-800 hover:underline">
          Admin
        </Link>
        <span aria-hidden="true"> / </span>
        <span>Settings</span>
      </nav>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Interest rates</h1>
        <p className="mt-1 text-sm text-slate-600">
          Annual simple-interest rate for each payout term. Visitors never see these rates.
        </p>
      </div>

      {!stored ? (
        <AdminCard>
          <p role="alert" className="text-sm font-medium text-red-700">
            The current rates could not be loaded. Reload the page to try again.
          </p>
        </AdminCard>
      ) : (
        <div className="space-y-6">
          {storedInvalid && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              The saved rates could not be read, so visitors cannot get quotes. The default rates are shown. Unlock,
              check them and select Save rates to fix this.
            </p>
          )}
          {unlocked ? (
            <RatesEditor
              stored={stored}
              storageConfigured={isRateStorageConfigured()}
              unlockMinutes={RATES_UNLOCK_SECONDS / 60}
            />
          ) : (
            <LockedRates stored={stored} savedNotice={savedNotice} />
          )}
          <RatesHistory stored={stored} />
        </div>
      )}
    </AdminFrame>
  );
}
