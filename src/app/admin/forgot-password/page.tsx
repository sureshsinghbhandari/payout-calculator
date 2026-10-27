import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";
import { isAccountStorageConfigured } from "@/lib/server/accounts-store";
import { authConfig } from "@/lib/server/auth";
import { isEmailEnabled } from "@/lib/server/email";

export const metadata: Metadata = {
  title: "Forgot password | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

/** Admin Forgot password: emails a link to set a new password. */
export default function AdminForgotPasswordPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <ForgotContent />
    </Suspense>
  );
}

async function ForgotContent() {
  await connection();
  const available = authConfig().ok && isAccountStorageConfigured() && isEmailEnabled();

  return (
    <AdminFrame user={null}>
      <div className="mx-auto max-w-md">
        <AdminCard>
          <h1 className="text-xl font-semibold text-slate-900">Forgot your password?</h1>
          {available ? (
            <>
              <p className="mt-1 text-sm text-slate-600">
                Enter your username or the email address on your account. We will email you a link to choose a new
                password.
              </p>
              <ForgotPasswordForm kind="admin" />
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate-700">
                Password reset by email is not available yet, because email is not set up. Ask a Master Admin to set a
                temporary password for you or to send you a setup link.
              </p>
              <p className="mt-6 text-sm">
                <Link href="/admin" className="font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950">
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </AdminCard>
      </div>
    </AdminFrame>
  );
}
