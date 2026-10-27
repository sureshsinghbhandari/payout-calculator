import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminBreadcrumb, AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { ChangePasswordForm } from "@/components/admin/ChangePasswordForm";
import { MyEmailSettings } from "@/components/admin/MyEmailSettings";
import { can, ROLE_LABELS, toPublicAdmin } from "@/lib/accounts";
import { needsNewPassword, requireAdminPage } from "@/lib/server/auth";
import { isEmailEnabled } from "@/lib/server/email";
import { MIN_USER_PASSWORD_LENGTH } from "@/lib/server/passwords";
import { logoutAction } from "../actions";

export const metadata: Metadata = {
  title: "My account | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AccountContent />
    </Suspense>
  );
}

async function AccountContent() {
  await connection();
  const user = await requireAdminPage(undefined, { allowPasswordChange: true });
  const mustChange = needsNewPassword(user);

  return (
    <AdminFrame user={mustChange ? null : toPublicAdmin(user)}>
      {!mustChange && <AdminBreadcrumb items={[{ label: "Admin", href: "/admin/inquiries" }, { label: "My account" }]} />}
      <div className="space-y-6">
        <AdminCard>
          <h1 className="text-xl font-semibold text-slate-900">{mustChange ? "Choose your password" : "My account"}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {user.name} ({user.username}), {ROLE_LABELS[user.role]}
          </p>
          {mustChange && (
            <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              You signed in with a temporary password. Choose your own password to continue. Use the temporary password
              as your current password.
            </p>
          )}
          <ChangePasswordForm minLength={MIN_USER_PASSWORD_LENGTH} />
          {mustChange && (
            <form action={logoutAction} className="mt-6 border-t border-slate-200 pt-4">
              <button type="submit" className="text-sm font-semibold text-slate-600 underline underline-offset-2 hover:text-slate-900">
                Sign out
              </button>
            </form>
          )}
        </AdminCard>

        {!mustChange && (
          <AdminCard>
            <h2 className="text-lg font-semibold text-slate-900">Email and alerts</h2>
            <p className="mb-5 mt-1 text-sm text-slate-600">
              Your email address gets new inquiry alerts and lets you reset your password if you forget it.
            </p>
            <MyEmailSettings
              email={user.email}
              inquiryAlerts={user.inquiryAlerts}
              emailEnabled={isEmailEnabled()}
              canManageEmail={can(user.role, "email.manage")}
            />
          </AdminCard>
        )}
      </div>
    </AdminFrame>
  );
}
