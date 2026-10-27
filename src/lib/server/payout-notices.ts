import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { AdminUser } from "../accounts";
import { adminActor, SYSTEM_ACTOR } from "../audit";
import { formatCents, formatIsoDate } from "../format";
import { paymentFor, scheduleOrNull, todayUtc } from "../investments";
import {
  confirmationBlocker,
  confirmationTemplateValues,
  describeNoticeRun,
  findDueReminders,
  noticeKey,
  reminderTemplateValues,
  type NoticeRun,
} from "../payout-notices";
import { getInvestor, isAccountStorageConfigured, listInvestors } from "./accounts-store";
import { recordAudit } from "./audit-store";
import { isEmailEnabled, payoutEmailSender } from "./email";
import {
  addSentNotice,
  claimNotices,
  isNoticeStorageConfigured,
  readPayoutNoticeSettings,
  releaseNotices,
  saveLastNoticeRun,
} from "./payout-notices-store";

/**
 * Payout emails to investors (see lib/payout-notices.ts): the daily reminder
 * job (/api/cron/payout-notices, or Run now on Settings > Email) and the
 * payment confirmation sent after a payout is marked as paid.
 */

/** Stop starting new emails after this long, so the job ends well within the function time limit. */
const RUN_TIME_BUDGET_MS = 45_000;

/** True when CRON_SECRET is set (its value is never shown). */
export function isCronSecretSet(): boolean {
  return Boolean(process.env.CRON_SECRET?.trim());
}

/**
 * Checks the "Authorization: Bearer <CRON_SECRET>" header Vercel sends with
 * cron requests. Always false when CRON_SECRET is not set.
 */
export function isCronRequestAuthorized(authorization: string | null): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !authorization) return false;
  // Compare hashes, so the comparison takes the same time whatever the length.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}

/**
 * Emails a reminder for every unpaid payout scheduled in the next N days
 * (Settings > Email) that has not had one yet. Skips everything when
 * reminders are off or email is not set up. Records the run on Settings >
 * Email and in the audit log. `origin` is the site address for portal links.
 */
export async function runPayoutReminders(
  trigger: { kind: "schedule" } | { kind: "manual"; by: Pick<AdminUser, "id" | "name" | "username" | "role"> },
  origin: string,
): Promise<NoticeRun> {
  const started = Date.now();
  const run: NoticeRun = {
    at: new Date(started).toISOString(),
    trigger: trigger.kind,
    by: trigger.kind === "manual" ? trigger.by.name : null,
    skipped: null,
    reminderDays: 0,
    sent: 0,
    failed: 0,
    alreadySent: 0,
    postponed: 0,
    optedOut: 0,
    noEmail: 0,
  };
  const failures: string[] = [];

  try {
    if (!isNoticeStorageConfigured() || !isAccountStorageConfigured()) {
      run.skipped = "storage is not connected";
    } else {
      run.reminderDays = (await readPayoutNoticeSettings()).reminderDays;
      const send = run.reminderDays > 0 ? await payoutEmailSender("payoutReminder") : null;
      if (run.reminderDays === 0) run.skipped = "payout reminders are switched off";
      else if (!send) run.skipped = "email is not set up yet";
      else {
        const { due, optedOut, noEmail } = findDueReminders(await listInvestors(), todayUtc(), run.reminderDays);
        run.optedOut = optedOut;
        run.noEmail = noEmail;
        // Claim first: a reminder claimed by another run at the same moment is never sent twice.
        const claimed = new Set(await claimNotices(due.map((d) => d.key)));
        run.alreadySent = due.length - claimed.size;
        const release: string[] = [];
        const portal = `${origin}/portal`;

        for (const reminder of due.filter((d) => claimed.has(d.key))) {
          if (Date.now() - started > RUN_TIME_BUDGET_MS) {
            run.postponed++;
            release.push(reminder.key);
            continue;
          }
          const { investor, investment, row } = reminder;
          const result = await send(
            investor.email.trim(),
            reminderTemplateValues(investor, investment, row, reminder.payoutCount, portal),
            `payout-reminder-${reminder.key}`,
          );
          if (result.ok) run.sent++;
          else {
            run.failed++;
            release.push(reminder.key);
            failures.push(`${investor.name} (${result.error})`);
          }
        }
        // Failed and postponed reminders are tried again on the next run.
        await releaseNotices(release).catch((error) => console.error("Releasing payout reminders failed", error));
      }
    }
  } catch (error) {
    console.error("Payout reminder run failed", error);
    // Sending itself never throws, so this happens before any reminder is sent.
    run.skipped = "the run failed with an error (see the server logs)";
  }

  await saveLastNoticeRun(run).catch((error) => console.error("Saving the payout reminder run failed", error));
  recordAudit({
    actor: trigger.kind === "manual" ? adminActor(trigger.by) : SYSTEM_ACTOR,
    category: "email",
    action: run.skipped ? "email.payout_reminders_skipped" : run.failed > 0 ? "email.payout_reminders_partial" : "email.payout_reminders",
    summary: `Payout reminders (${trigger.kind === "manual" ? "Run now" : "daily job"}): ${describeNoticeRun(run)}${
      failures.length > 0 ? `. Could not reach ${failures.slice(0, 10).join(", ")}` : ""
    }`,
  });
  return run;
}

/** Why a payment confirmation cannot be emailed to this investor now, or null when it can. */
export function paymentConfirmationBlocker(investor: Parameters<typeof confirmationBlocker>[0]): string | null {
  return confirmationBlocker(investor, isEmailEnabled());
}

/**
 * Emails the investor a confirmation of a recorded payment (run after the
 * response, with next/server after()). Reads the investor again, so a payment
 * removed or an opt-out made in the meantime is respected. Never throws.
 */
export async function sendPaymentConfirmation(input: {
  investorId: string;
  investmentId: string;
  payoutNumber: number;
  by: Pick<AdminUser, "id" | "name" | "username" | "role">;
  origin: string;
}): Promise<void> {
  try {
    const investor = await getInvestor(input.investorId);
    const investment = investor?.investments.find((i) => i.id === input.investmentId);
    const payment = investment ? paymentFor(investment, input.payoutNumber) : null;
    const schedule = investment ? scheduleOrNull(investment) : null;
    if (!investor || !investment || !payment || !schedule) return;
    if (confirmationBlocker(investor, isEmailEnabled())) return;
    const send = await payoutEmailSender("paymentConfirmation");
    if (!send) return;

    const to = investor.email.trim();
    const payoutCount = schedule.rows.length;
    const result = await send(
      to,
      confirmationTemplateValues(investor, investment, payment, payoutCount, `${input.origin}/portal`),
      `payment-confirmation-${noticeKey(investment.id, payment.payoutNumber, "confirmation")}-${payment.recordedAt}`,
    );
    const what = `payout ${payment.payoutNumber} of ${payoutCount} (${formatCents(payment.amountCents)} paid on ${formatIsoDate(payment.paidOn)})`;
    recordAudit({
      actor: adminActor(input.by),
      category: "email",
      action: result.ok ? "email.payment_confirmation" : "email.failed",
      summary: result.ok
        ? `Emailed a payment confirmation for ${what} to ${to}`
        : `Could not email a payment confirmation for ${what} to ${to}: ${result.error}`,
      target: { type: "investor", id: investor.id, label: `${investor.name} (${investor.username})` },
    });
    if (result.ok) await addSentNotice(noticeKey(investment.id, payment.payoutNumber, "confirmation"));
  } catch (error) {
    console.error("Sending payment confirmation failed", input.investorId, input.investmentId, input.payoutNumber, error);
  }
}
