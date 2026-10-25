import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { adminConfig, isAdmin } from "@/lib/server/admin-auth";

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

  if (!adminConfig().ok) {
    return (
      <AdminFrame signedIn={false}>
        <AdminCard>
          <h1 className="text-xl font-semibold text-slate-900">Admin access is not set up</h1>
          <p className="mt-2 text-sm text-slate-600">
            Set the <code>ADMIN_PASSWORD</code> and <code>ADMIN_SESSION_SECRET</code> environment variables, then
            redeploy. See the README for the steps.
          </p>
        </AdminCard>
      </AdminFrame>
    );
  }

  if (await isAdmin()) redirect("/admin/inquiries");

  return (
    <AdminFrame signedIn={false}>
      <AdminCard>
        <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-600">Enter the admin password to manage inquiries and interest rates.</p>
        <AdminLoginForm />
      </AdminCard>
    </AdminFrame>
  );
}
