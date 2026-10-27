import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminBreadcrumb, AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { ChangePasswordForm } from "@/components/admin/ChangePasswordForm";
import { MyEmailSettings } from "@/components/admin/MyEmailSettings";
import { TwoStepSettings } from "@/components/two-step/TwoStepSettings";
import { can, hasTwoStep, ROLE_LABELS, toPublicAdmin, type AdminUser } from "@/lib/accounts";
import { needsNewPassword, needsTwoStepSetup, requireAdminPage } from "@/lib/server/auth";
import { isEmailEnabled } from "@/lib/server/email";
import { MIN_USER_PASSWORD_LENGTH } from "@/lib/server/passwords";
import { pendingSetupDetails } from "@/lib/server/two-step";
import { logoutAction } from "../actions";
import {
  cancelAdminTwoStepSetupAction,
  confirmAdminTwoStepAction,
  disableAdminTwoStepAction,
  startAdminTwoStepSetupAction,
} from "../two-step-actions";

export const metadata: Metadata = {
  title: "My account | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function AccountPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AccountContent searchParams={searchParams} />
    </Suspense>
  );
}

const TWO_STEP_ACTIONS = {
  start: startAdminTwoStepSetupAction,
  cancelSetup: cancelAdminTwoStepSetupAction,
  confirm: confirmAdminTwoStepAction,
  disable: disableAdminTwoStepAction,
};

function SignOutLink() {
  return (
    <form action={logoutAction} className="mt-6 border-t border-slate-200 pt-4">
      <button type="submit" className="text-sm font-semibold text-slate-600 underline underline-offset-2 hover:text-slate-900">
        Sign out
      </button>
    </form>
  );
}

function TwoStepSection({
  user,
  required,
  params,
}: {
  user: AdminUser;
  required: boolean;
  params: Record<string, string | string[] | undefined>;
}) {
  const recoveryLeft = typeof params["recovery-left"] === "string" ? Number(params["recovery-left"]) : NaN;
  return (
    <TwoStepSettings
      username={user.username}
      enabled={hasTwoStep(user)}
      enabledAt={user.totpEnabledAt}
      recoveryCodesLeft={user.recoveryCodeHashes.length}
      setup={hasTwoStep(user) ? null : pendingSetupDetails("admin", user)}
      required={required}
      actions={TWO_STEP_ACTIONS}
      // After a required setup, go straight into the admin.
      doneHref={required ? "/admin/inquiries" : undefined}
      justTurnedOff={params["two-step"] === "off"}
      signedInWithRecovery={Number.isInteger(recoveryLeft) && recoveryLeft >= 0 ? recoveryLeft : null}
    />
  );
}

async function AccountContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const user = await requireAdminPage(undefined, { allowAccountSetup: true });
  const params = await searchParams;
  const mustChange = needsNewPassword(user);
  const mustSetUpTwoStep = !mustChange && needsTwoStepSetup(user);

  // Master Admins without two-step sign-in set it up before anything else.
  if (mustSetUpTwoStep) {
    return (
      <AdminFrame user={null}>
        <AdminCard>
          <h1 className="text-xl font-semibold text-slate-900">Set up two-step sign-in</h1>
          <p className="mt-1 text-sm text-slate-600">
            {user.name} ({user.username}), {ROLE_LABELS[user.role]}
          </p>
          <p className="mb-6 mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Master Admins must use two-step sign-in, because they can see and change everything. Set it up now to continue.
            You need an authenticator app on your phone.
          </p>
          <TwoStepSection user={user} required params={params} />
          <SignOutLink />
        </AdminCard>
      </AdminFrame>
    );
  }

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
          {mustChange && <SignOutLink />}
        </AdminCard>

        {!mustChange && (
          <AdminCard>
            <h2 className="text-lg font-semibold text-slate-900">Two-step sign-in</h2>
            <p className="mb-5 mt-1 text-sm text-slate-600">
              {user.role === "master"
                ? "Required for Master Admins: after your password, you enter a code from an authenticator app on your phone."
                : "Optional: after your password, you enter a code from an authenticator app on your phone."}
            </p>
            <TwoStepSection user={user} required={user.role === "master"} params={params} />
          </AdminCard>
        )}

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
