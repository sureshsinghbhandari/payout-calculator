import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminCard as Card, AdminFrame, AdminTabs } from "@/components/admin/AdminFrame";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { RatesEditor } from "@/components/admin/RatesEditor";
import { adminConfig, isAdmin } from "@/lib/server/admin-auth";
import { isRateStorageConfigured, readStoredRatesForAdmin, type StoredRates } from "@/lib/server/rates-store";

export const metadata: Metadata = {
  title: "Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <AdminFrame>
      <Suspense fallback={<p className="text-sm text-slate-600">Loading…</p>}>
        <AdminContent />
      </Suspense>
    </AdminFrame>
  );
}

async function AdminContent() {
  // Everything here depends on the request (cookies, live rates).
  await connection();

  const config = adminConfig();
  if (!config.ok) {
    return (
      <Card>
        <h1 className="text-xl font-semibold text-slate-900">Admin access is not set up</h1>
        <p className="mt-2 text-sm text-slate-600">
          Set the <code>ADMIN_PASSWORD</code> and <code>ADMIN_SESSION_SECRET</code> environment variables, then
          redeploy. See the README for the steps.
        </p>
      </Card>
    );
  }

  if (!(await isAdmin())) {
    return (
      <Card>
        <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-600">Enter the admin password to manage interest rates and inquiries.</p>
        <AdminLoginForm />
      </Card>
    );
  }

  let stored: StoredRates | null = null;
  let storedInvalid = false;
  let loadError = false;
  try {
    ({ stored, invalid: storedInvalid } = await readStoredRatesForAdmin());
  } catch (error) {
    console.error("Reading rates failed", error);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <AdminTabs active="rates" />
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Interest rates</h1>
        <p className="mt-1 text-sm text-slate-600">
          Annual simple-interest rate for each payout term. Visitors never see these rates.
        </p>
      </div>
      {loadError || !stored ? (
        <Card>
          <p role="alert" className="text-sm font-medium text-red-700">
            The current rates could not be loaded. Reload the page to try again.
          </p>
        </Card>
      ) : (
        <>
          {storedInvalid && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              The saved rates could not be read, so visitors cannot get quotes. The default rates are shown below.
              Check them and select Save rates to fix this.
            </p>
          )}
          <RatesEditor stored={stored} storageConfigured={isRateStorageConfigured()} />
        </>
      )}
    </div>
  );
}
