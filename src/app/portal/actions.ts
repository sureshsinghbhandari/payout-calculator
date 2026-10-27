"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AccountError, isAccountStorageConfigured, setInvestorPassword } from "@/lib/server/accounts-store";
import {
  authConfig,
  endInvestorSession,
  getCurrentInvestor,
  startInvestorSession,
  verifyInvestorCredentials,
} from "@/lib/server/auth";
import { clientKey, LoginThrottle } from "@/lib/server/login-throttle";
import { hashPassword, validateNewPassword, verifyPassword } from "@/lib/server/passwords";
import { recordAudit } from "@/lib/server/audit-store";
import { investorActor, visitorActor } from "@/lib/audit";

/**
 * Investor portal actions. Server actions are public endpoints: every action
 * that touches an account checks the investor's session itself.
 */

const PORTAL = "/portal";
const FAILED_ATTEMPT_DELAY_MS = 1000;
/** Longer inputs are rejected before any hashing work is done. */
const MAX_INPUT_LENGTH = 200;

// 5 failures per 15 minutes (the LoginThrottle defaults).
const loginThrottle = new LoginThrottle();
// Wrong "current password" attempts while signed in, per investor.
const currentPasswordThrottle = new LoginThrottle();

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tooManyAttempts(waitMs: number): string {
  const minutes = Math.ceil(waitMs / 60_000);
  return `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

// ---------- sign in ----------

export interface InvestorLoginState {
  error?: string;
  /** What the investor typed, so the form keeps it after an error. */
  username?: string;
}

const LOGIN_FAILED = "Incorrect username or password.";

export async function investorLoginAction(_prev: InvestorLoginState, formData: FormData): Promise<InvestorLoginState> {
  const username = text(formData, "username").slice(0, MAX_INPUT_LENGTH);
  const password = text(formData, "password");

  if (!authConfig().ok || !isAccountStorageConfigured()) {
    return { error: "Sign-in is not available right now. Please contact us.", username };
  }

  const client = clientKey(await headers());
  const waitMs = loginThrottle.blockedFor(client, Date.now());
  if (waitMs > 0) return { error: tooManyAttempts(waitMs), username };

  let result: Awaited<ReturnType<typeof verifyInvestorCredentials>> = null;
  if (username.trim() !== "" && password !== "" && password.length <= MAX_INPUT_LENGTH) {
    try {
      result = await verifyInvestorCredentials(username, password);
    } catch (error) {
      console.error("Investor sign-in failed", error);
      return { error: "Sign-in is not available right now. Please try again.", username };
    }
  }

  if (!result) {
    const tried = username.trim().toLowerCase().slice(0, 64);
    recordAudit({
      actor: visitorActor("Unknown visitor", tried || undefined),
      category: "sign-in",
      action: "investor.sign_in_failed",
      summary: tried ? `Failed investor sign-in for username "${tried}"` : "Failed investor sign-in",
    });
    loginThrottle.recordFailure(client, Date.now());
    // Slow down repeated guessing.
    await wait(FAILED_ATTEMPT_DELAY_MS);
    return { error: LOGIN_FAILED, username };
  }

  loginThrottle.reset(client);
  await startInvestorSession(result.investor);
  recordAudit({
    actor: investorActor(result.investor),
    category: "sign-in",
    action: "investor.sign_in",
    summary: "Signed in to the investor portal",
  });
  redirect(PORTAL);
}

// ---------- sign out ----------

export async function investorLogoutAction(): Promise<void> {
  const investor = await getCurrentInvestor();
  if (investor) {
    recordAudit({
      actor: investorActor(investor),
      category: "sign-in",
      action: "investor.sign_out",
      summary: "Signed out of the investor portal",
    });
  }
  await endInvestorSession();
  redirect(PORTAL);
}

// ---------- change password ----------

export interface InvestorPasswordState {
  error?: string;
  fieldErrors?: Partial<Record<"current" | "password" | "confirm", string>>;
}

export async function investorChangePasswordAction(
  _prev: InvestorPasswordState,
  formData: FormData,
): Promise<InvestorPasswordState> {
  const investor = await getCurrentInvestor();
  if (!investor) return { error: "Your session has ended. Sign in again." };

  const current = text(formData, "current");
  const password = text(formData, "password");
  const confirm = text(formData, "confirm");

  if (current === "") return { fieldErrors: { current: "Enter your current password." } };
  const invalid = validateNewPassword(password, confirm);
  if (invalid) {
    // The new password itself is fine, so the problem is the confirmation.
    const field = validateNewPassword(password, password) ? "password" : "confirm";
    return { fieldErrors: { [field]: invalid } };
  }

  const key = `investor:${investor.id}`;
  const waitMs = currentPasswordThrottle.blockedFor(key, Date.now());
  if (waitMs > 0) return { error: tooManyAttempts(waitMs) };

  const currentOk = current.length <= MAX_INPUT_LENGTH && (await verifyPassword(current, investor.passwordHash));
  if (!currentOk) {
    currentPasswordThrottle.recordFailure(key, Date.now());
    await wait(FAILED_ATTEMPT_DELAY_MS);
    return { fieldErrors: { current: "Your current password is incorrect." } };
  }
  currentPasswordThrottle.reset(key);

  if (await verifyPassword(password, investor.passwordHash)) {
    return { fieldErrors: { password: "Choose a password that is different from your current one." } };
  }

  let updated;
  try {
    updated = await setInvestorPassword(investor.id, await hashPassword(password), false);
  } catch (error) {
    if (error instanceof AccountError) return { error: error.message };
    console.error("Changing investor password failed", error);
    return { error: "Your password could not be changed. Please try again." };
  }

  recordAudit({
    actor: investorActor(updated),
    category: "sign-in",
    action: "investor.password_changed",
    summary: "Changed their own password",
  });
  // The new password version signs out older sessions, including this one: start a fresh one.
  await startInvestorSession(updated);
  redirect(`${PORTAL}?changed=1`);
}
