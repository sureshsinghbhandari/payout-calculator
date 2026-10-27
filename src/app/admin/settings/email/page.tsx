import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminBreadcrumb, AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { TestEmailForm } from "@/components/admin/email/TestEmailForm";
import { toPublicAdmin } from "@/lib/accounts";
import { newPartOfReply, type UnmatchedEmail } from "@/lib/email";
import { requireAdminPage } from "@/lib/server/auth";
import { emailStatus } from "@/lib/server/email";
import { listUnmatchedEmails } from "@/lib/server/email-store";

export const metadata: Metadata = {
  title: "Email | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

const WEBHOOK_EVENTS = ["email.received", "email.delivered", "email.bounced", "email.failed", "email.complained"];

const timestampFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

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

/** Email setup status, the Resend webhook details, a test email and emails that matched no inquiry (Master Admin). */
async function EmailSettingsContent() {
  await connection();
  const user = await requireAdminPage("email.manage");
  const status = emailStatus();
  const host = (await headers()).get("host") ?? "payout-calculator-steel.vercel.app";
  const webhookUrl = `${host.startsWith("localhost") ? "http" : "https"}://${host}/api/email/inbound`;
  let unmatched: UnmatchedEmail[] | null = null;
  try {
    unmatched = await listUnmatchedEmails();
  } catch (error) {
    console.error("Loading unmatched emails failed", error);
  }

  const row = "flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-2.5 last:border-0";
  return (
    <AdminFrame user={toPublicAdmin(user)}>
      <AdminBreadcrumb items={[{ label: "Admin", href: "/admin/inquiries" }, { label: "Settings" }, { label: "Email" }]} />
      <h1 className="text-2xl font-semibold text-slate-900">Email</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        Emails are sent and received through Resend. New inquiries get an automatic acknowledgement with their reference
        number, staff can email customers from each inquiry, and customer replies appear on the inquiry.
      </p>

      <div className="mt-6 space-y-6">
        <AdminCard>
          <h2 className="text-lg font-semibold text-slate-900">Status</h2>
          <div className="mt-3 text-sm">
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
              <span className="break-all font-medium text-slate-900">
                {status.replyDomain ? `reply+…@${status.replyDomain}` : "The sender address"}
              </span>
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
          <h2 className="text-lg font-semibold text-slate-900">Resend webhook</h2>
          <p className="mt-1 text-sm text-slate-600">
            In Resend, open Webhooks, add an endpoint with these details, then copy its signing secret into the{" "}
            <code className="rounded bg-slate-100 px-1">RESEND_WEBHOOK_SECRET</code> environment variable in Vercel.
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

        <AdminCard>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Test</h2>
          {status.sending ? (
            <TestEmailForm />
          ) : (
            <p className="text-sm text-slate-700">Set RESEND_API_KEY and EMAIL_FROM in Vercel first.</p>
          )}
        </AdminCard>

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
                    From {e.from} · To {e.to} · {timestampFormatter.format(new Date(e.at))} UTC
                  </p>
                  <p className="mt-2 line-clamp-6 whitespace-pre-wrap break-words text-sm text-slate-800">
                    {newPartOfReply(e.text)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      </div>
    </AdminFrame>
  );
}
