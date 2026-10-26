import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { authConfig, getCurrentAdmin, needsNewPassword } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

/** Admin sign-in. Signed-in admins go straight to Inquiries. */
export default function AdminPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminContent />
    </Suspense>
  );
}

async function AdminContent() {
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
  if (user) redirect(needsNewPassword(user) ? "/admin/account" : "/admin/inquiries");

  return (
    <AdminFrame user={null}>
      <AdminCard>
        <h1 className="text-xl font-semibold text-slate-900">Admin sign in</h1>
        <p className="mt-1 text-sm text-slate-600">Sign in with your username and password.</p>
        <AdminLoginForm />
      </AdminCard>
    </AdminFrame>
  );
}
