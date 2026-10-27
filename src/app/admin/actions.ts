"use server";

import { refresh, updateTag } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminActor, visitorActor } from "@/lib/audit";
import { formatPercent } from "@/lib/format";
import { inquiryReference, isInquiryId, type StoredInquiry } from "@/lib/inquiry";
import { FREQUENCY_LABELS } from "@/lib/payout";
import type { PayoutFrequency } from "@/lib/payout";
import { RATE_FREQUENCIES, validateRateTable, type RateTable } from "@/lib/rates";
import { setAdminPassword } from "@/lib/server/accounts-store";
import { recordAudit } from "@/lib/server/audit-store";
import {
  authConfig,
  endAdminSession,
  getCurrentAdmin,
  isRatesUnlocked,
  lockRates,
  requireAdminPermission,
  startAdminSession,
  unlockRates,
  verifyAdminCredentials,
} from "@/lib/server/auth";
import { purgeInquiry, restoreInquiry, setInquiryStatus, softDeleteInquiry } from "@/lib/server/inquiry-store";
import { clientKey, LoginThrottle } from "@/lib/server/login-throttle";
import { hashPassword, validateNewPassword, verifyPassword } from "@/lib/server/passwords";
import { isRateStorageConfigured, RATES_TAG, readStoredRates, saveRates } from "@/lib/server/rates-store";

const FAILED_LOGIN_DELAY_MS = 1000;
const loginThrottle = new LoginThrottle();

async function throttled(): Promise<{ client: string; error?: string }> {
  const client = clientKey(await headers());
  const waitMs = loginThrottle.blockedFor(client, Date.now());
  if (waitMs > 0) {
    const minutes = Math.ceil(waitMs / 60_000);
    return { client, error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  }
  return { client };
}

async function failedAttempt(client: string): Promise<void> {
  loginThrottle.recordFailure(client, Date.now());
  // Slow down repeated guessing.
  await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS));
}

// ---------- sign in / out ----------

export interface LoginState {
  error?: string;
  username?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (!authConfig().ok) return { error: "Admin access is not configured." };
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  const { client, error } = await throttled();
  if (error) return { error, username };

  const result = await verifyAdminCredentials(username, password);
  if (!result) {
    const tried = username.trim().toLowerCase().slice(0, 64);
    recordAudit({
      actor: visitorActor("Unknown visitor", tried || undefined),
      category: "sign-in",
      action: "admin.sign_in_failed",
      summary: tried ? `Failed admin sign-in for username "${tried}"` : "Failed admin sign-in",
    });
    await failedAttempt(client);
    return { error: "Incorrect username or password.", username };
  }
  loginThrottle.reset(client);
  await startAdminSession(result.user);
  recordAudit({ actor: adminActor(result.user), category: "sign-in", action: "admin.sign_in", summary: "Signed in to admin" });
  redirect(result.mustChangePassword ? "/admin/account" : "/admin/inquiries");
}

export async function logoutAction(): Promise<void> {
  const user = await getCurrentAdmin();
  if (user) {
    recordAudit({ actor: adminActor(user), category: "sign-in", action: "admin.sign_out", summary: "Signed out of admin" });
  }
  await endAdminSession();
  redirect("/admin");
}

// ---------- own password ----------

export interface ChangePasswordState {
  error?: string;
  fieldErrors?: Partial<Record<"current" | "password", string>>;
}

/** Any signed-in admin can change their own password (required after a bootstrap or temporary password). */
export async function changeOwnPasswordAction(_prev: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const user = await getCurrentAdmin();
  if (!user) return { error: "Your session has ended. Sign in again." };

  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const { client, error } = await throttled();
  if (error) return { error };

  const currentOk = user.passwordHash
    ? await verifyPassword(current, user.passwordHash)
    : Boolean(await verifyAdminCredentials(user.username, current));
  if (!currentOk) {
    await failedAttempt(client);
    return { fieldErrors: { current: "Your current password is not correct." } };
  }
  const problem = validateNewPassword(password, confirm);
  if (problem) return { fieldErrors: { password: problem } };
  if (password === current) return { fieldErrors: { password: "Choose a password different from the current one." } };

  const updated = await setAdminPassword(user.id, await hashPassword(password), false);
  recordAudit({
    actor: adminActor(user),
    category: "sign-in",
    action: "admin.password_changed",
    summary: "Changed their own password",
  });
  loginThrottle.reset(client);
  // The password version changed, so issue a new session for this admin.
  await startAdminSession(updated);
  redirect("/admin/inquiries?password=changed");
}

// ---------- interest rates (Master Admin) ----------

export interface UnlockState {
  error?: string;
}

const RATES_PAGE = "/admin/settings/rates";

/** Re-checks the signed-in admin's own password before rates can be edited. */
export async function unlockRatesAction(_prev: UnlockState, formData: FormData): Promise<UnlockState> {
  const user = await requireAdminPermission("rates.manage");
  if (!user) return { error: "You do not have access to interest rates, or your session has ended." };

  const { client, error } = await throttled();
  if (error) return { error };

  const password = String(formData.get("password") ?? "");
  if (!(await verifyPassword(password, user.passwordHash))) {
    recordAudit({
      actor: adminActor(user),
      category: "rates",
      action: "rates.unlock_failed",
      summary: "Failed to unlock interest rates (wrong password)",
      target: { type: "rates", label: "Interest rates" },
    });
    await failedAttempt(client);
    return { error: "Incorrect password." };
  }
  loginThrottle.reset(client);
  await unlockRates(user);
  recordAudit({
    actor: adminActor(user),
    category: "rates",
    action: "rates.unlocked",
    summary: "Unlocked interest rates for editing",
    target: { type: "rates", label: "Interest rates" },
  });
  redirect(RATES_PAGE);
}

export async function lockRatesAction(): Promise<void> {
  await lockRates();
  redirect(RATES_PAGE);
}

export interface SaveRatesState {
  status: "idle" | "saved" | "error";
  message?: string;
  fieldErrors?: Partial<Record<PayoutFrequency, string>>;
  /** What the admin typed, so the form keeps it after an error. */
  values?: Partial<Record<PayoutFrequency, string>>;
}

export async function saveRatesAction(_prev: SaveRatesState, formData: FormData): Promise<SaveRatesState> {
  const user = await requireAdminPermission("rates.manage");
  if (!user) return { status: "error", message: "You do not have access to interest rates, or your session has ended." };
  if (!(await isRatesUnlocked(user))) {
    return { status: "error", message: "Editing is locked. Unlock the rates with your password, then save again." };
  }

  const values: Partial<Record<PayoutFrequency, string>> = {};
  for (const frequency of RATE_FREQUENCIES) {
    const value = formData.get(frequency);
    values[frequency] = typeof value === "string" ? value : "";
  }
  const result = validateRateTable(values);
  if (!result.ok) {
    return { status: "error", message: "Fix the highlighted rates.", fieldErrors: result.errors, values };
  }
  if (!isRateStorageConfigured()) {
    return { status: "error", message: "Rate storage is not configured, so rates cannot be saved.", values };
  }

  let before: RateTable | null = null;
  try {
    before = (await readStoredRates()).rates;
  } catch {
    // The audit entry then lists the new rates only.
  }
  try {
    await saveRates(result.value, new Date().toISOString());
  } catch (error) {
    console.error("Saving rates failed", error);
    return { status: "error", message: "The rates could not be saved. Please try again.", values };
  }
  recordAudit({
    actor: adminActor(user),
    category: "rates",
    action: "rates.saved",
    summary: describeRateChange(before, result.value),
    target: { type: "rates", label: "Interest rates" },
  });

  // New quotes use the new rates immediately. Editing locks again after a save.
  updateTag(RATES_TAG);
  await lockRates();
  redirect(`${RATES_PAGE}?saved=1`);
}

function describeRateChange(before: RateTable | null, after: RateTable): string {
  const parts = RATE_FREQUENCIES.flatMap((f) => {
    if (!before) return [`${FREQUENCY_LABELS[f]} ${formatPercent(after[f])}`];
    if (before[f] === after[f]) return [];
    return [`${FREQUENCY_LABELS[f]} ${formatPercent(before[f])} to ${formatPercent(after[f])}`];
  });
  if (parts.length === 0) return "Saved interest rates (no changes)";
  return `Changed interest rates: ${parts.join(", ")}`;
}

// ---------- inquiries ----------

function inquiryTarget(inquiry: StoredInquiry) {
  return { type: "inquiry" as const, id: inquiry.id, label: `${inquiryReference(inquiry.id)} (${inquiry.name})` };
}

function inquiryId(formData: FormData): string | null {
  const id = formData.get("id");
  return typeof id === "string" && isInquiryId(id) ? id : null;
}

/** Marks an inquiry as new or contacted (Master and Sales Admins). */
export async function setInquiryStatusAction(formData: FormData): Promise<void> {
  const user = await requireAdminPermission("inquiries.status");
  if (!user) return;
  const id = inquiryId(formData);
  const status = formData.get("status");
  if (!id || (status !== "new" && status !== "contacted")) return;
  try {
    const updated = await setInquiryStatus(id, status);
    if (updated) {
      recordAudit({
        actor: adminActor(user),
        category: "inquiry",
        action: "inquiry.status",
        summary: `Marked inquiry ${inquiryReference(updated.id)} (${updated.name}) as ${status}`,
        target: inquiryTarget(updated),
      });
    }
  } catch (error) {
    console.error("Updating inquiry failed", error);
  }
  refresh();
}

/** Soft-deletes an inquiry: it moves to Deleted inquiries with status "deleted" (Master Admin). */
export async function deleteInquiryAction(formData: FormData): Promise<void> {
  const user = await requireAdminPermission("inquiries.delete");
  if (!user) return;
  const id = inquiryId(formData);
  if (!id) return;
  try {
    const updated = await softDeleteInquiry(id, new Date().toISOString());
    if (updated) {
      recordAudit({
        actor: adminActor(user),
        category: "inquiry",
        action: "inquiry.deleted",
        summary: `Deleted inquiry ${inquiryReference(updated.id)} (${updated.name})`,
        target: inquiryTarget(updated),
      });
    }
  } catch (error) {
    console.error("Deleting inquiry failed", error);
  }
  refresh();
}

/** Restores a deleted inquiry to its previous status (Master Admin). */
export async function restoreInquiryAction(formData: FormData): Promise<void> {
  const user = await requireAdminPermission("inquiries.delete");
  if (!user) return;
  const id = inquiryId(formData);
  if (!id) return;
  try {
    const updated = await restoreInquiry(id);
    if (updated) {
      recordAudit({
        actor: adminActor(user),
        category: "inquiry",
        action: "inquiry.restored",
        summary: `Restored inquiry ${inquiryReference(updated.id)} (${updated.name}) as ${updated.status}`,
        target: inquiryTarget(updated),
      });
    }
  } catch (error) {
    console.error("Restoring inquiry failed", error);
  }
  refresh();
}

/**
 * TEMPORARY (to be removed before go-live): permanently deletes an inquiry that
 * is already in Deleted inquiries. Master Admin only. Cannot be undone.
 */
export async function purgeInquiryAction(formData: FormData): Promise<void> {
  const user = await requireAdminPermission("inquiries.purge");
  if (!user) return;
  const id = inquiryId(formData);
  if (!id) return;
  try {
    const removed = await purgeInquiry(id);
    if (removed) {
      recordAudit({
        actor: adminActor(user),
        category: "inquiry",
        action: "inquiry.purged",
        summary: `Permanently deleted inquiry ${inquiryReference(removed.id)} (${removed.name})`,
        target: inquiryTarget(removed),
      });
    }
  } catch (error) {
    console.error("Permanently deleting inquiry failed", error);
  }
  refresh();
}
