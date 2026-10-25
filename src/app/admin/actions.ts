"use server";

import { refresh, updateTag } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { PayoutFrequency } from "@/lib/payout";
import { RATE_FREQUENCIES, validateRateTable } from "@/lib/rates";
import {
  adminConfig,
  checkAdminPassword,
  endAdminSession,
  isAdmin,
  startAdminSession,
} from "@/lib/server/admin-auth";
import { clientKey, LoginThrottle } from "@/lib/server/login-throttle";
import { isRateStorageConfigured, RATES_TAG, saveRates } from "@/lib/server/rates-store";

export interface LoginState {
  error?: string;
}

const FAILED_LOGIN_DELAY_MS = 1000;
const loginThrottle = new LoginThrottle();

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (!adminConfig().ok) return { error: "Admin access is not configured." };

  const client = clientKey(await headers());
  const waitMs = loginThrottle.blockedFor(client, Date.now());
  if (waitMs > 0) {
    const minutes = Math.ceil(waitMs / 60_000);
    return { error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  }

  const password = formData.get("password");
  if (typeof password !== "string" || !checkAdminPassword(password)) {
    loginThrottle.recordFailure(client, Date.now());
    // Slow down repeated guessing.
    await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS));
    return { error: "Incorrect password." };
  }
  loginThrottle.reset(client);
  await startAdminSession();
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await endAdminSession();
  redirect("/admin");
}

export interface SaveRatesState {
  status: "idle" | "saved" | "error";
  message?: string;
  fieldErrors?: Partial<Record<PayoutFrequency, string>>;
  /** What the admin typed, so the form keeps it after an error. */
  values?: Partial<Record<PayoutFrequency, string>>;
}

export async function saveRatesAction(_prev: SaveRatesState, formData: FormData): Promise<SaveRatesState> {
  if (!(await isAdmin())) {
    return { status: "error", message: "Your session has ended. Sign in again to change rates." };
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

  try {
    await saveRates(result.value, new Date().toISOString());
  } catch (error) {
    console.error("Saving rates failed", error);
    return { status: "error", message: "The rates could not be saved. Please try again.", values };
  }

  // New quotes use the new rates immediately; refresh this page's history.
  updateTag(RATES_TAG);
  refresh();
  return { status: "saved", message: "Rates saved. New calculations use them immediately." };
}
