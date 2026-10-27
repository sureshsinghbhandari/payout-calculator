"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { adminActor } from "@/lib/audit";
import { describeNoticeRun, MAX_REMINDER_DAYS, parseReminderDays } from "@/lib/payout-notices";
import { recordAudit } from "@/lib/server/audit-store";
import { requireAdminPermission } from "@/lib/server/auth";
import { runPayoutReminders } from "@/lib/server/payout-notices";
import { isNoticeStorageConfigured, saveReminderDays } from "@/lib/server/payout-notices-store";
import { siteOrigin } from "@/lib/server/site-url";

/** Payout emails to investors (Master Admin, Settings > Email). */

const NO_ACCESS = "You do not have permission to do this, or your session has ended.";

export interface ReminderDaysState {
  status?: "saved" | "error";
  message?: string;
  /** What the admin typed, kept after an error. */
  days?: string;
}

export async function saveReminderDaysAction(_prev: ReminderDaysState, formData: FormData): Promise<ReminderDaysState> {
  const user = await requireAdminPermission("email.manage");
  if (!user) return { status: "error", message: NO_ACCESS };
  const raw = formData.get("days");
  const typed = typeof raw === "string" ? raw.slice(0, 10) : "";
  const days = parseReminderDays(typed);
  if (days === null) {
    return { status: "error", message: `Enter a whole number of days from 0 to ${MAX_REMINDER_DAYS}.`, days: typed };
  }
  if (!isNoticeStorageConfigured()) return { status: "error", message: "Storage is not connected, so this cannot be saved.", days: typed };

  try {
    await saveReminderDays(days, user);
  } catch (error) {
    console.error("Saving payout reminder days failed", error);
    return { status: "error", message: "The setting could not be saved. Please try again.", days: typed };
  }
  recordAudit({
    actor: adminActor(user),
    category: "email",
    action: "email.payout_reminder_days",
    summary:
      days === 0
        ? "Switched payout reminders to investors off"
        : `Set payout reminders to investors to ${days} ${days === 1 ? "day" : "days"} before each payout`,
  });
  refresh();
  return {
    status: "saved",
    message: days === 0 ? "Saved. Payout reminders are off." : `Saved. Reminders go out ${days} ${days === 1 ? "day" : "days"} before each payout.`,
  };
}

export interface RunRemindersState {
  status?: "done" | "error";
  message?: string;
}

/** Runs the daily payout reminder job now. It skips everything when email is not set up. */
export async function runPayoutRemindersAction(): Promise<RunRemindersState> {
  const user = await requireAdminPermission("email.manage");
  if (!user) return { status: "error", message: NO_ACCESS };
  try {
    const run = await runPayoutReminders({ kind: "manual", by: user }, siteOrigin(await headers()));
    refresh();
    return { status: "done", message: `${describeNoticeRun(run)}.` };
  } catch (error) {
    console.error("Running payout reminders failed", error);
    return { status: "error", message: "The reminders could not be run. Please try again." };
  }
}
