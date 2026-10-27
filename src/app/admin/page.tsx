import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { TwoStepSignInForm } from "@/components/two-step/TwoStepSignInForm";
import { adminAccountReady, authConfig, getCurrentAdmin, getPendingTwoStepAdmin } from "@/lib/server/auth";
import { cancelAdminTwoStepAction, verifyAdminTwoStepAction } from "./two-step-actions";

export const metadata: Metadata = {
  title: "Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Admin sign-in (password, then the two-step code when it is on). Signed-in admins go straight to Inquiries. */
export default function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();

  if (!authConfig().ok) {
    return (
      <AdminFrame user={null}>
        <AdminCard>
          <h1 className="text-xl font-semibold text-slate-900">Admin access is not set up</h1>
          <p className="mt-2 text-sm text-slate-600">
            Set the <code>ADMIN_SESSION_SECRET</code> environment variable, then redeploy. See the README for the steps.
          </p>
        </AdminCard>
      </AdminFrame>
    );
  }

  const user = await getCurrentAdmin();
  if (user) redirect(adminAccountReady(user) ? "/admin/inquiries" : "/admin/account");

  // The password was right; the code from the authenticator app is still needed.
  const pending = await getPendingTwoStepAdmin();
  if (pending) {
    return (
      <AdminFrame user={null}>
        <AdminCard>
          <h1 className="text-xl font-semibold text-slate-900">Two-step sign-in</h1>
          <p className="mt-1 text-sm text-slate-600">
            Signing in as <span className="font-semibold text-slate-900">{pending.username}</span>. Open your authenticator
            app and enter the code it shows.
          </p>
          <TwoStepSignInForm action={verifyAdminTwoStepAction} cancelAction={cancelAdminTwoStepAction} />
        </AdminCard>
      </AdminFrame>
    );
  }

  const timedOut = (await searchParams).timeout === "1";
  return (
    <AdminFrame user={null}>
      <AdminCard>
        <h1 className="text-xl font-semibold text-slate-900">Admin sign in</h1>
        <p className="mt-1 text-sm text-slate-600">Sign in with your username and password.</p>
        {timedOut && (
          <p role="status" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Your sign-in timed out before the code was entered. Sign in again with your password.
          </p>
        )}
        <AdminLoginForm />
      </AdminCard>
    </AdminFrame>
  );
}
