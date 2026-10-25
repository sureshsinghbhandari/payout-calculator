import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { RatesEditor } from "@/components/admin/RatesEditor";
import { adminConfig, isAdmin } from "@/lib/server/admin-auth";
import { isRateStorageConfigured, readStoredRatesForAdmin, type StoredRates } from "@/lib/server/rates-store";
import { logoutAction } from "./actions";

export const metadata: Metadata = {
  title: "Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <span className="text-base font-semibold text-slate-900">Investment Payout Calculator: Admin</span>
          <Link href="/" className="text-sm font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950">
            View calculator
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <Suspense fallback={<p className="text-sm text-slate-600">Loading…</p>}>
          <AdminContent />
        </Suspense>
      </main>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">{children}</div>;
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
        <p className="mt-1 text-sm text-slate-600">Enter the admin password to manage interest rates.</p>
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Interest rates</h1>
          <p className="mt-1 text-sm text-slate-600">
            Annual simple-interest rate for each payout term. Visitors never see these rates.
          </p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
          >
            Sign out
          </button>
        </form>
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
