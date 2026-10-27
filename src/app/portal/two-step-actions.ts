"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasTwoStep, type Investor } from "@/lib/accounts";
import { investorActor } from "@/lib/audit";
import { recordAudit } from "@/lib/server/audit-store";
import {
  authConfig,
  endTwoStepSignIn,
  getCurrentInvestor,
  getPendingTwoStepInvestor,
  startInvestorSession,
} from "@/lib/server/auth";
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
 * Two-step sign-in for investors (optional): the code step of signing in, and
 * setting it up or turning it off on /portal/security. Server actions are
 * public endpoints: each one checks the investor's session or pending sign-in.
 */

const PORTAL = "/portal";
const SECURITY_PAGE = "/portal/security";
const FAILED_ATTEMPT_DELAY_MS = 1000;
const SESSION_ENDED = "Your session has ended. Sign in again.";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function selfTarget(investor: Investor) {
  return { type: "investor" as const, id: investor.id, label: `${investor.name} (${investor.username})` };
}

/** The signed-in investor, when they may change their sign-in settings (not while a new password is required). */
async function currentInvestor(): Promise<Investor | null> {
  const investor = await getCurrentInvestor();
  return investor && !investor.mustChangePassword ? investor : null;
}

// ---------- signing in: the code step ----------

export async function verifyInvestorTwoStepAction(
  _prev: TwoStepCodeState,
  formData: FormData,
): Promise<TwoStepCodeState> {
  if (!authConfig().ok) return { error: "Sign-in is not available right now. Please contact us." };
  let investor: Investor | null;
  try {
    investor = await getPendingTwoStepInvestor();
  } catch (error) {
    console.error("Investor two-step sign-in failed", error);
    return { error: "Sign-in is not available right now. Please try again." };
  }
  if (!investor) {
    // Took longer than 5 minutes, or the account changed: start again with the password.
    await endTwoStepSignIn("investor");
    redirect(`${PORTAL}?timeout=1`);
  }

  const result = await checkTwoStepCode("investor", investor, text(formData, "code"), clientKey(await headers()), {
    allowRecovery: true,
  });
  if (!result.ok) {
    if (!result.blocked) {
      recordAudit({
        actor: investorActor(investor),
        category: "sign-in",
        action: "investor.two_step_failed",
        summary: "Entered a wrong two-step sign-in code",
        target: selfTarget(investor),
      });
      await wait(FAILED_ATTEMPT_DELAY_MS);
    }
    return { error: result.error };
  }

  await endTwoStepSignIn("investor");
  await startInvestorSession(investor);
  recordAudit({
    actor: investorActor(investor),
    category: "sign-in",
    action: "investor.sign_in",
    summary:
      result.method === "app"
        ? "Signed in to the investor portal (two-step sign-in with the authenticator app)"
        : `Signed in to the investor portal with a recovery code (${result.recoveryCodesLeft} left)`,
  });
  // A new password, if required, comes first (the portal page asks for it).
  if (result.method === "recovery" && !investor.mustChangePassword) {
    redirect(`${SECURITY_PAGE}?recovery-left=${result.recoveryCodesLeft}`);
  }
  redirect(PORTAL);
}

/** "Start again": forgets the pending sign-in. */
export async function cancelInvestorTwoStepAction(): Promise<void> {
  await endTwoStepSignIn("investor");
  redirect(PORTAL);
}

// ---------- security page: turning it on ----------

/** Creates a new secret to scan. Any earlier unconfirmed one is replaced. */
export async function startInvestorTwoStepSetupAction(): Promise<void> {
  const investor = await currentInvestor();
  if (!investor || hasTwoStep(investor)) return;
  try {
    await beginTwoStepSetup("investor", investor.id);
  } catch (error) {
    console.error("Starting investor two-step sign-in setup failed", error);
  }
  refresh();
}

export async function cancelInvestorTwoStepSetupAction(): Promise<void> {
  const investor = await currentInvestor();
  if (!investor || hasTwoStep(investor)) return;
  try {
    await cancelTwoStepSetup("investor", investor.id);
  } catch (error) {
    console.error("Cancelling investor two-step sign-in setup failed", error);
  }
  refresh();
}

/** Turns two-step sign-in on once the code from the app is right. Returns the recovery codes (shown once). */
export async function confirmInvestorTwoStepAction(
  _prev: TwoStepConfirmState,
  formData: FormData,
): Promise<TwoStepConfirmState> {
  const investor = await currentInvestor();
  if (!investor) return { status: "error", message: SESSION_ENDED };
  if (hasTwoStep(investor)) return { status: "error", message: "Two-step sign-in is already on. Reload the page." };

  let result;
  try {
    result = await confirmTwoStepSetup("investor", investor, text(formData, "code"), clientKey(await headers()));
  } catch (error) {
    console.error("Turning on investor two-step sign-in failed", error);
    return { status: "error", message: "Two-step sign-in could not be turned on. Please try again." };
  }
  if (!result.ok) return { status: "error", message: result.error };

  recordAudit({
    actor: investorActor(investor),
    category: "sign-in",
    action: "investor.two_step_on",
    summary: "Turned on two-step sign-in",
    target: selfTarget(investor),
  });
  return { status: "enabled", recoveryCodes: result.recoveryCodes };
}

// ---------- security page: turning it off ----------

/** Needs the current password and a code (or a recovery code). */
export async function disableInvestorTwoStepAction(
  _prev: TwoStepDisableState,
  formData: FormData,
): Promise<TwoStepDisableState> {
  const investor = await currentInvestor();
  if (!investor) return { status: "error", message: SESSION_ENDED };
  if (!hasTwoStep(investor)) return { status: "error", message: "Two-step sign-in is already off. Reload the page." };

  const client = clientKey(await headers());
  const waitMs = codeAttemptsBlockedFor("investor", investor.id, client);
  if (waitMs > 0) return { status: "error", message: tooManyCodesMessage(waitMs) };

  const current = text(formData, "current");
  if (current === "" || current.length > 200 || !(await verifyPassword(current, investor.passwordHash))) {
    recordTwoStepFailure("investor", investor.id, client);
    await wait(FAILED_ATTEMPT_DELAY_MS);
    return { status: "error", fieldErrors: { current: "Your current password is incorrect." } };
  }
  const check = await checkTwoStepCode("investor", investor, text(formData, "code"), client, { allowRecovery: true });
  if (!check.ok) {
    if (!check.blocked) await wait(FAILED_ATTEMPT_DELAY_MS);
    return check.blocked
      ? { status: "error", message: check.error }
      : { status: "error", fieldErrors: { code: check.error } };
  }

  try {
    await turnOffTwoStep("investor", investor.id);
  } catch (error) {
    console.error("Turning off investor two-step sign-in failed", error);
    return { status: "error", message: "Two-step sign-in could not be turned off. Please try again." };
  }
  recordAudit({
    actor: investorActor(investor),
    category: "sign-in",
    action: "investor.two_step_off",
    summary:
      check.method === "recovery"
        ? "Turned off two-step sign-in (confirmed with a recovery code)"
        : "Turned off two-step sign-in",
    target: selfTarget(investor),
  });
  redirect(`${SECURITY_PAGE}?two-step=off`);
}
