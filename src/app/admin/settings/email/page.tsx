import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminBreadcrumb, AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { CheckRepliesButton } from "@/components/admin/email/CheckRepliesButton";
import { ReminderDaysForm, RunRemindersButton } from "@/components/admin/email/PayoutNoticeControls";
import { TestEmailForm } from "@/components/admin/email/TestEmailForm";
import { toPublicAdmin } from "@/lib/accounts";
import { newPartOfReply, type UnmatchedEmail } from "@/lib/email";
import { describeNoticeRun, REMINDER_SCHEDULE_TEXT } from "@/lib/payout-notices";
import { requireAdminPage } from "@/lib/server/auth";
import { EMAIL_PROVIDER_LABELS, emailStatus, gmailCheckState } from "@/lib/server/email";
import { listUnmatchedEmails, type GmailCheckState } from "@/lib/server/email-store";
import { isCronSecretSet } from "@/lib/server/payout-notices";
import {
  isNoticeStorageConfigured,
  readPayoutNoticeSettings,
  type PayoutNoticeSettings,
} from "@/lib/server/payout-notices-store";
import { formatTimestamp } from "@/lib/time";

export const metadata: Metadata = {
  title: "Email | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

const WEBHOOK_EVENTS = ["email.received", "email.delivered", "email.bounced", "email.failed", "email.complained"];


export default function EmailSettingsPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <EmailSettingsContent />
    </Suspense>
  );
}

function StatusPill({ on, onText, offText }: { on: boolean; onText: string; offText: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${on ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}
    >
      {on ? onText : offText}
    </span>
  );
}

/** Email provider status, a test email and provider-specific details (Master Admin). */
async function EmailSettingsContent() {
  await connection();
  const user = await requireAdminPage("email.manage");
  const status = emailStatus();
  const host = (await headers()).get("host") ?? "payout-calculator-steel.vercel.app";
  const webhookUrl = `${host.startsWith("localhost") ? "http" : "https"}://${host}/api/email/inbound`;

  let gmail: GmailCheckState | null = null;
  let unmatched: UnmatchedEmail[] | null = null;
  try {
    if (status.provider === "gmail") gmail = await gmailCheckState();
    if (status.provider === "resend") unmatched = await listUnmatchedEmails();
  } catch (error) {
    console.error("Loading email details failed", error);
  }
  let notices: PayoutNoticeSettings | null = null;
  try {
    notices = await readPayoutNoticeSettings();
  } catch (error) {
    console.error("Loading payout email settings failed", error);
  }
  const cronSecretSet = isCronSecretSet();

  const row = "flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-2.5 last:border-0";
  return (
    <AdminFrame user={toPublicAdmin(user)}>
      <AdminBreadcrumb items={[{ label: "Admin", href: "/admin/inquiries" }, { label: "Settings" }, { label: "Email" }]} />
      <h1 className="text-2xl font-semibold text-slate-900">Email</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        New inquiries get an automatic acknowledgement with their reference number, staff can email customers from each
        inquiry, and customer replies appear on the inquiry. The provider is chosen with the{" "}
        <code className="rounded bg-slate-100 px-1">EMAIL_PROVIDER</code> setting in Vercel: <strong>gmail</strong> now,{" "}
        <strong>resend</strong> once there is a company domain.
      </p>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Admins with an email address can get new inquiry alerts (My account), and admins and investors can reset a
        forgotten password by email. The wording of these emails is on{" "}
        <Link href="/admin/settings/email-templates" className="font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950">
          Email templates
        </Link>
        .
      </p>

      <div className="mt-6 space-y-6">
        <AdminCard>
          <h2 className="text-lg font-semibold text-slate-900">Status</h2>
          <div className="mt-3 text-sm">
            <div className={row}>
              <span className="text-slate-700">Provider</span>
              <span className="font-medium text-slate-900">{status.provider ? EMAIL_PROVIDER_LABELS[status.provider] : "None"}</span>
            </div>
            <div className={row}>
              <span className="text-slate-700">Sending emails</span>
              <StatusPill on={status.sending} onText="On" offText="Off" />
            </div>
            <div className={row}>
              <span className="text-slate-700">Receiving customer replies</span>
              <StatusPill on={status.receiving} onText="On" offText="Off" />
            </div>
            <div className={row}>
              <span className="text-slate-700">Sent from</span>
              <span className="break-all font-medium text-slate-900">{status.from ?? "Not set"}</span>
            </div>
            <div className={row}>
              <span className="text-slate-700">Replies go to</span>
              <span className="break-all font-medium text-slate-900">{status.replyAddress ?? "The sender address"}</span>
            </div>
          </div>
          {status.problems.length > 0 && (
            <ul className="mt-4 list-disc space-y-1 rounded-lg bg-amber-50 p-3 pl-7 text-sm text-amber-900">
              {status.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </AdminCard>

        <AdminCard>
          <h2 className="text-lg font-semibold text-slate-900">Payout emails to investors</h2>
          <p className="mt-1 text-sm text-slate-600">
            Investors with an email address get a reminder before each scheduled payout, and a confirmation when a
            Master Admin marks a payout as paid (an option in the Mark as paid dialog). Investors can switch these emails
            off in the portal. They never include the earnings rate. The wording is on{" "}
            <Link href="/admin/settings/email-templates" className="font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950">
              Email templates
            </Link>
            .
          </p>
          {notices === null ? (
            <p role="alert" className="mt-3 text-sm font-medium text-red-700">
              These settings could not be loaded. Reload the page to try again.
            </p>
          ) : (
            <>
              <div className="mt-4">
                <ReminderDaysForm days={notices.reminderDays} storageConfigured={isNoticeStorageConfigured()} />
              </div>
              <div className="mt-4 text-sm">
                <div className={row}>
                  <span className="text-slate-700">Reminders</span>
                  <span className="text-right font-medium text-slate-900">
                    {notices.reminderDays === 0
                      ? "Off"
                      : `${notices.reminderDays} ${notices.reminderDays === 1 ? "day" : "days"} before each payout`}
                  </span>
                </div>
                <div className={row}>
                  <span className="text-slate-700">Daily job</span>
                  <span className="text-right font-medium text-slate-900">Runs {REMINDER_SCHEDULE_TEXT}</span>
                </div>
                <div className={row}>
                  <span className="text-slate-700">CRON_SECRET</span>
                  <StatusPill on={cronSecretSet} onText="Set" offText="Not set" />
                </div>
                <div className={row}>
                  <span className="text-slate-700">Last run</span>
                  <span className="text-right font-medium text-slate-900">
                    {notices.lastRun
                      ? `${formatTimestamp(notices.lastRun.at)} (${
                          notices.lastRun.trigger === "manual" ? `Run now by ${notices.lastRun.by ?? "an admin"}` : "daily job"
                        })`
                      : "Not yet"}
                  </span>
                </div>
              </div>
              {notices.lastRun && <p className="mt-2 text-sm text-slate-700">{describeNoticeRun(notices.lastRun)}.</p>}
              {(!cronSecretSet || !status.sending) && (
                <ul className="mt-4 list-disc space-y-1 rounded-lg bg-amber-50 p-3 pl-7 text-sm text-amber-900">
                  {!status.sending && <li>Email is not set up yet, so no payout emails are sent. Runs are skipped.</li>}
                  {!cronSecretSet && (
                    <li>
                      CRON_SECRET is not set, so the daily job is refused. Add a random value of at least 16 characters
                      as CRON_SECRET in Vercel, then redeploy.
                    </li>
                  )}
                </ul>
              )}
              <div className="mt-4">
                <p className="mb-2 text-sm text-slate-600">
                  Run now sends any reminders that are due and not sent yet, the same as the daily job. No reminder is
                  ever sent twice.
                </p>
                <RunRemindersButton disabled={!isNoticeStorageConfigured()} />
              </div>
            </>
          )}
        </AdminCard>

        {status.provider === "gmail" && (
          <AdminCard>
            <h2 className="text-lg font-semibold text-slate-900">Gmail replies</h2>
            <p className="mt-1 text-sm text-slate-600">
              Emails ask customers to reply to a special address of this Gmail account, which Gmail delivers to the same
              inbox. The inbox is checked whenever an admin opens the inquiries (at most once a minute) or selects Check for
              replies. Only replies to inquiries are read and saved; other emails in the inbox are left alone.
            </p>
            <p className="mt-3 text-sm text-slate-700">
              Last checked:{" "}
              <span className="font-medium text-slate-900">
                {gmail?.checkedAt ? formatTimestamp(gmail.checkedAt) : "Not yet"}
              </span>
            </p>
            {gmail?.error && (
              <p role="alert" className="mt-2 text-sm font-medium text-red-700">
                Last check failed: {gmail.error}
              </p>
            )}
            {status.receiving && (
              <div className="mt-4">
                <CheckRepliesButton />
              </div>
            )}
          </AdminCard>
        )}

        {status.provider === "resend" && (
          <AdminCard>
            <h2 className="text-lg font-semibold text-slate-900">Resend webhook</h2>
            <p className="mt-1 text-sm text-slate-600">
              In Resend, open Webhooks, add an endpoint with these details, then put its signing secret in the{" "}
              <code className="rounded bg-slate-100 px-1">RESEND_WEBHOOK_SECRET</code> setting in Vercel.
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="font-semibold text-slate-900">Endpoint URL</dt>
                <dd className="mt-1 break-all rounded-lg bg-slate-50 p-2 font-mono text-xs text-slate-800">{webhookUrl}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-900">Events</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {WEBHOOK_EVENTS.map((e) => (
                    <code key={e} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">
                      {e}
                    </code>
                  ))}
                </dd>
              </div>
            </dl>
          </AdminCard>
        )}

        <AdminCard>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Test</h2>
          {status.sending ? (
            <TestEmailForm />
          ) : (
            <p className="text-sm text-slate-700">Finish the setup above first.</p>
          )}
        </AdminCard>

        {status.provider === "resend" && (
          <AdminCard>
            <h2 className="text-lg font-semibold text-slate-900">Emails that matched no inquiry</h2>
            <p className="mt-1 text-sm text-slate-600">
              Received emails without a reply address or reference number we recognise. The newest 100 are kept.
            </p>
            {unmatched === null ? (
              <p role="alert" className="mt-3 text-sm font-medium text-red-700">
                These could not be loaded. Reload the page to try again.
              </p>
            ) : unmatched.length === 0 ? (
              <p className="mt-3 text-sm text-slate-700">None.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {unmatched.map((e) => (
                  <li key={e.id} className="rounded-xl border border-slate-200 p-4">
                    <p className="break-words text-sm font-semibold text-slate-900">{e.subject}</p>
                    <p className="mt-0.5 break-all text-xs text-slate-500">
                      From {e.from} · To {e.to} · {formatTimestamp(e.at)}
                    </p>
                    <p className="mt-2 line-clamp-6 whitespace-pre-wrap break-words text-sm text-slate-800">
                      {newPartOfReply(e.text)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </AdminCard>
        )}
      </div>
    </AdminFrame>
  );
}
