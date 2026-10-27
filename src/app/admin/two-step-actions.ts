"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasTwoStep, type AdminUser } from "@/lib/accounts";
import { adminActor } from "@/lib/audit";
import { recordAudit } from "@/lib/server/audit-store";
import {
  authConfig,
  endTwoStepSignIn,
  getCurrentAdmin,
  getPendingTwoStepAdmin,
  needsNewPassword,
  needsTwoStepSetup,
  startAdminSession,
} from "@/lib/server/auth";
import { signInClientHash } from "@/lib/server/client-fingerprint";
import { clientKey } from "@/lib/server/login-throttle";
import { verifyPassword } from "@/lib/server/passwords";
import {
  beginTwoStepSetup,
  cancelTwoStepSetup,
  checkTwoStepCode,
  codeAttemptsBlockedFor,
  confirmTwoStepSetup,
  recordTwoStepFailure,
  tooManyCodesMessage,
  turnOffTwoStep,
} from "@/lib/server/two-step";
import type { TwoStepCodeState, TwoStepConfirmState, TwoStepDisableState } from "@/lib/two-step";

/**
 * Two-step sign-in for admins: the code step of signing in, and setting it up
 * or turning it off in My account. Codes and secrets are never logged or
 * written to the audit log.
 */

const FAILED_ATTEMPT_DELAY_MS = 1000;
const SESSION_ENDED = "Your session has ended. Sign in again.";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function selfTarget(user: AdminUser) {
  return { type: "user" as const, id: user.id, label: `${user.name} (${user.username})` };
}

// ---------- signing in: the code step ----------

export async function verifyAdminTwoStepAction(_prev: TwoStepCodeState, formData: FormData): Promise<TwoStepCodeState> {
  const config = authConfig();
  if (!config.ok) return { error: "Admin access is not configured." };
  const user = await getPendingTwoStepAdmin();
  if (!user) {
    // Took longer than 5 minutes, or the account changed: start again with the password.
    await endTwoStepSignIn("admin");
    redirect("/admin?timeout=1");
  }

  const requestHeaders = await headers();
  const result = await checkTwoStepCode("admin", user, text(formData, "code"), clientKey(requestHeaders), {
    allowRecovery: true,
  });
  if (!result.ok) {
    if (!result.blocked) {
      recordAudit({
        actor: adminActor(user),
        category: "sign-in",
        action: "admin.two_step_failed",
        summary: "Entered a wrong two-step sign-in code",
        target: selfTarget(user),
      });
      await wait(FAILED_ATTEMPT_DELAY_MS);
    }
    return { error: result.error };
  }

  await endTwoStepSignIn("admin");
  await startAdminSession(user);
  recordAudit({
    actor: adminActor(user),
    category: "sign-in",
    action: "admin.sign_in",
    summary:
      result.method === "app"
        ? "Signed in to admin (two-step sign-in with the authenticator app)"
        : `Signed in to admin with a recovery code (${result.recoveryCodesLeft} left)`,
    // A hash of the network and browser, for the new-device sign-in alert.
    client: signInClientHash(requestHeaders, config.secret),
  });
  if (needsNewPassword(user) || needsTwoStepSetup(user)) redirect("/admin/account");
  redirect(
    result.method === "recovery" ? `/admin/account?recovery-left=${result.recoveryCodesLeft}` : "/admin/inquiries",
  );
}

/** "Start again": forgets the pending sign-in. */
export async function cancelAdminTwoStepAction(): Promise<void> {
  await endTwoStepSignIn("admin");
  redirect("/admin");
}

// ---------- My account: turning it on ----------

/** Creates a new secret to scan. Any earlier unconfirmed one is replaced. */
export async function startAdminTwoStepSetupAction(): Promise<void> {
  const user = await getCurrentAdmin();
  if (!user || needsNewPassword(user) || hasTwoStep(user)) return;
  try {
    await beginTwoStepSetup("admin", user.id);
  } catch (error) {
    console.error("Starting two-step sign-in setup failed", error);
  }
  refresh();
}

export async function cancelAdminTwoStepSetupAction(): Promise<void> {
  const user = await getCurrentAdmin();
  if (!user || hasTwoStep(user)) return;
  try {
    await cancelTwoStepSetup("admin", user.id);
  } catch (error) {
    console.error("Cancelling two-step sign-in setup failed", error);
  }
  refresh();
}

/**
 * Turns two-step sign-in on once the code from the app is right. The page is
 * not refreshed here, so the form can show the recovery codes (once).
 */
export async function confirmAdminTwoStepAction(
  _prev: TwoStepConfirmState,
  formData: FormData,
): Promise<TwoStepConfirmState> {
  const user = await getCurrentAdmin();
  if (!user || needsNewPassword(user)) return { status: "error", message: SESSION_ENDED };
  if (hasTwoStep(user)) return { status: "error", message: "Two-step sign-in is already on. Reload the page." };

  let result;
  try {
    result = await confirmTwoStepSetup("admin", user, text(formData, "code"), clientKey(await headers()));
  } catch (error) {
    console.error("Turning on two-step sign-in failed", error);
    return { status: "error", message: "Two-step sign-in could not be turned on. Please try again." };
  }
  if (!result.ok) return { status: "error", message: result.error };

  recordAudit({
    actor: adminActor(user),
    category: "sign-in",
    action: "admin.two_step_on",
    summary: "Turned on two-step sign-in",
    target: selfTarget(user),
  });
  return { status: "enabled", recoveryCodes: result.recoveryCodes };
}

// ---------- My account: turning it off ----------

/** Needs the current password and a code (or a recovery code). Master Admins are asked to set it up again straight away. */
export async function disableAdminTwoStepAction(
  _prev: TwoStepDisableState,
  formData: FormData,
): Promise<TwoStepDisableState> {
  const user = await getCurrentAdmin();
  if (!user || needsNewPassword(user)) return { status: "error", message: SESSION_ENDED };
  if (!hasTwoStep(user)) return { status: "error", message: "Two-step sign-in is already off. Reload the page." };

  const client = clientKey(await headers());
  const waitMs = codeAttemptsBlockedFor("admin", user.id, client);
  if (waitMs > 0) return { status: "error", message: tooManyCodesMessage(waitMs) };

  const current = text(formData, "current");
  if (current === "" || current.length > 200 || !(await verifyPassword(current, user.passwordHash))) {
    recordTwoStepFailure("admin", user.id, client);
    await wait(FAILED_ATTEMPT_DELAY_MS);
    return { status: "error", fieldErrors: { current: "Your current password is not correct." } };
  }
  const check = await checkTwoStepCode("admin", user, text(formData, "code"), client, { allowRecovery: true });
  if (!check.ok) {
    if (!check.blocked) await wait(FAILED_ATTEMPT_DELAY_MS);
    return check.blocked
      ? { status: "error", message: check.error }
      : { status: "error", fieldErrors: { code: check.error } };
  }

  try {
    await turnOffTwoStep("admin", user.id);
  } catch (error) {
    console.error("Turning off two-step sign-in failed", error);
    return { status: "error", message: "Two-step sign-in could not be turned off. Please try again." };
  }
  recordAudit({
    actor: adminActor(user),
    category: "sign-in",
    action: "admin.two_step_off",
    summary:
      check.method === "recovery"
        ? "Turned off two-step sign-in (confirmed with a recovery code)"
        : "Turned off two-step sign-in",
    target: selfTarget(user),
  });
  redirect("/admin/account?two-step=off");
}
