/**
 * Payout emails to investors: a reminder a few days before each scheduled
 * payout (sent by a daily job) and a payment confirmation when a Master Admin
 * records a payout as paid. Pure helpers shared by the job, the admin pages
 * and the portal.
 *
 * Every email is noted in a sent-log keyed by investment, payout number and
 * kind, so the same reminder is never sent twice. The interest rate is never
 * part of these emails.
 */
import type { Investment, Investor, PayoutPayment } from "./accounts";
import { addDays } from "./dates";
import { formatCents, formatDollars, formatIsoDate, formatIsoDateLong } from "./format";
import { firstNameOf } from "./email-templates";
import { payoutsWithStatus, scheduleOrNull } from "./investments";
import type { PayoutRow } from "./payout";

export type NoticeKind = "reminder" | "confirmation";

/** Days before a payout the reminder is sent. 0 switches reminders off. */
export const DEFAULT_REMINDER_DAYS = 3;
export const MAX_REMINDER_DAYS = 30;

/** When the daily job runs (vercel.json "crons"), for display. */
export const REMINDER_SCHEDULE_TEXT = "every day at about 13:00 UTC";

/** Sent-log key, e.g. "ivt_1a2b3c4d5e6f:3:reminder". */
export function noticeKey(investmentId: string, payoutNumber: number, kind: NoticeKind): string {
  return `${investmentId}:${payoutNumber}:${kind}`;
}

/** Reminder days typed by an admin, or null when not a whole number from 0 to MAX_REMINDER_DAYS. */
export function parseReminderDays(raw: unknown): number | null {
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (!/^\d{1,2}$/.test(text)) return null;
  const days = Number(text);
  return days <= MAX_REMINDER_DAYS ? days : null;
}

/** Why a payment confirmation cannot be emailed to this investor, or null when it can. */
export function confirmationBlocker(
  investor: Pick<Investor, "email" | "payoutEmails">,
  emailEnabled: boolean,
): string | null {
  if (!emailEnabled) return "Email is not set up yet, so no payment confirmation can be sent.";
  if (!investor.email.trim()) return "This investor has no email address, so no payment confirmation can be sent.";
  if (!investor.payoutEmails) return "This investor switched off payout emails in the portal, so no confirmation is sent.";
  return null;
}

/** "$100,000 investment of Jan 5, 2026" */
export function investmentText(investment: Pick<Investment, "principal" | "investmentDate">): string {
  return `${formatDollars(investment.principal)} investment of ${formatIsoDate(investment.investmentDate)}`;
}

/** Placeholder values for the payout reminder (without {team}). Never includes the interest rate. */
export function reminderTemplateValues(
  investor: Pick<Investor, "name">,
  investment: Investment,
  row: PayoutRow,
  payoutCount: number,
  portalLink: string,
): Record<string, string> {
  return {
    name: investor.name,
    firstName: firstNameOf(investor.name),
    amount: formatCents(row.totalPayoutCents),
    date: formatIsoDateLong(row.payoutDate),
    payoutNumber: String(row.payoutNumber),
    payoutCount: String(payoutCount),
    investment: investmentText(investment),
    link: portalLink,
  };
}

/** Placeholder values for the payment confirmation (without {team}). Never includes the interest rate. */
export function confirmationTemplateValues(
  investor: Pick<Investor, "name">,
  investment: Investment,
  payment: PayoutPayment,
  payoutCount: number,
  portalLink: string,
): Record<string, string> {
  return {
    name: investor.name,
    firstName: firstNameOf(investor.name),
    amount: formatCents(payment.amountCents),
    date: formatIsoDateLong(payment.paidOn),
    payoutNumber: String(payment.payoutNumber),
    payoutCount: String(payoutCount),
    reference: payment.reference || "(none)",
    investment: investmentText(investment),
    link: portalLink,
  };
}

export interface DueReminder {
  key: string;
  investor: Investor;
  investment: Investment;
  row: PayoutRow;
  payoutCount: number;
}

export interface DueReminders {
  /** Reminders to send (some may already have been sent; the sent-log decides). */
  due: DueReminder[];
  /** Payouts in the window whose investor switched payout emails off. */
  optedOut: number;
  /** Payouts in the window whose investor has no email address. */
  noEmail: number;
}

/**
 * Unpaid payouts of active investors scheduled after today and at most `days`
 * days ahead. Looking at the whole window (not only the exact day) means a
 * missed daily run is caught up the next day; the sent-log stops repeats.
 */
export function findDueReminders(investors: readonly Investor[], today: string, days: number): DueReminders {
  const result: DueReminders = { due: [], optedOut: 0, noEmail: 0 };
  if (days < 1) return result;
  const last = addDays(today, days);
  for (const investor of investors) {
    if (!investor.active) continue;
    for (const investment of investor.investments) {
      const schedule = scheduleOrNull(investment);
      if (!schedule) continue;
      for (const row of payoutsWithStatus(investment, schedule, today)) {
        if (row.status !== "upcoming" || row.payoutDate <= today || row.payoutDate > last) continue;
        if (!investor.email.trim()) result.noEmail++;
        else if (!investor.payoutEmails) result.optedOut++;
        else {
          result.due.push({
            key: noticeKey(investment.id, row.payoutNumber, "reminder"),
            investor,
            investment,
            row,
            payoutCount: schedule.rows.length,
          });
        }
      }
    }
  }
  return result;
}

// ---------- run summary ----------

export interface NoticeRun {
  /** ISO timestamp (UTC). */
  at: string;
  /** "schedule" for the daily job, "manual" for Run now. */
  trigger: "schedule" | "manual";
  /** Name of the admin who selected Run now. */
  by: string | null;
  /** Why nothing was sent, e.g. email is not set up; null when the run went ahead. */
  skipped: string | null;
  reminderDays: number;
  /** Reminders sent, that failed, already sent earlier, and left for the next run (time limit). */
  sent: number;
  failed: number;
  alreadySent: number;
  postponed: number;
  optedOut: number;
  noEmail: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One line for the audit log and Settings > Email, e.g. "2 reminders sent, 1 already sent earlier". */
export function describeNoticeRun(run: NoticeRun): string {
  if (run.skipped) return `Skipped: ${run.skipped}`;
  const parts = [plural(run.sent, "reminder sent", "reminders sent")];
  if (run.failed > 0) parts.push(`${run.failed} could not be sent`);
  if (run.alreadySent > 0) parts.push(`${run.alreadySent} already sent earlier`);
  if (run.postponed > 0) parts.push(`${run.postponed} left for the next run`);
  if (run.optedOut > 0) parts.push(`${plural(run.optedOut, "payout", "payouts")} of investors who switched payout emails off`);
  if (run.noEmail > 0) parts.push(`${plural(run.noEmail, "payout", "payouts")} of investors without an email address`);
  return parts.join(", ");
}

const count = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);

/** A stored run summary, or null when it is missing or damaged. */
export function parseNoticeRun(data: unknown): NoticeRun | null {
  const d = data as Record<string, unknown> | null;
  if (typeof d !== "object" || d === null || typeof d.at !== "string") return null;
  return {
    at: d.at,
    trigger: d.trigger === "manual" ? "manual" : "schedule",
    by: typeof d.by === "string" ? d.by : null,
    skipped: typeof d.skipped === "string" ? d.skipped : null,
    reminderDays: count(d.reminderDays),
    sent: count(d.sent),
    failed: count(d.failed),
    alreadySent: count(d.alreadySent),
    postponed: count(d.postponed),
    optedOut: count(d.optedOut),
    noEmail: count(d.noEmail),
  };
}
