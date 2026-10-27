import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after, connection } from "next/server";
import { Suspense } from "react";
import { AdminBreadcrumb, AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { CheckRepliesButton } from "@/components/admin/email/CheckRepliesButton";
import { EmailThreadView } from "@/components/admin/email/EmailThreadView";
import { ReplyForm } from "@/components/admin/email/ReplyForm";
import { InquiryTimeline } from "@/components/admin/inquiry/InquiryTimeline";
import { NoteForm } from "@/components/admin/inquiry/NoteForm";
import { InquiryCard } from "@/components/admin/InquiryCard";
import { can, toPublicAdmin } from "@/lib/accounts";
import { displayNameOf, replySubject, type EmailMessage } from "@/lib/email";
import { inquiryReference, isInquiryId } from "@/lib/inquiry";
import { inquiryTimeline, type TimelineEntry } from "@/lib/inquiry-log";
import { getInquiryActivity } from "@/lib/server/audit-store";
import { requireAdminPage } from "@/lib/server/auth";
import { checkGmailRepliesQuietly, emailStatus } from "@/lib/server/email";
import { getThread } from "@/lib/server/email-store";
import { getInquiry } from "@/lib/server/inquiry-store";

export const metadata: Metadata = {
  title: "Inquiry | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

type Params = Promise<{ id: string }>;

export default function InquiryPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <InquiryContent params={params} />
    </Suspense>
  );
}

/** One inquiry with its notes and activity, its emails, and a form to email the customer. */
async function InquiryContent({ params }: { params: Params }) {
  await connection();
  const user = await requireAdminPage("inquiries.view");
  const { id } = await params;
  if (!isInquiryId(id)) notFound();
  const inquiry = await getInquiry(id);
  // Sales Admins do not see deleted inquiries.
  if (!inquiry || (inquiry.status === "deleted" && !can(user.role, "inquiries.delete"))) notFound();

  const permissions = {
    status: can(user.role, "inquiries.status"),
    remove: can(user.role, "inquiries.delete"),
    convert: can(user.role, "inquiries.convert"),
    investors: can(user.role, "investors.manage"),
    purge: can(user.role, "inquiries.purge"),
  };
  const status = emailStatus();
  // With Gmail, replies are picked up by checking the inbox; new ones show on the next load.
  if (status.provider === "gmail" && status.receiving) after(checkGmailRepliesQuietly);
  const [messages, timeline] = await Promise.all([
    getThread(inquiry.id).then(
      (thread): EmailMessage[] | null => thread.messages,
      (error) => (console.error("Loading emails failed", error), null),
    ),
    getInquiryActivity(inquiry.id, inquiry.createdAt).then(
      (log): TimelineEntry[] | null => inquiryTimeline(log),
      (error) => (console.error("Loading inquiry activity failed", error), null),
    ),
  ]);
  const canAddNotes = can(user.role, "inquiries.notes") && inquiry.status !== "deleted";

  const firstName = inquiry.name.split(" ")[0] || inquiry.name;
  const team = status.from ? displayNameOf(status.from) : "";
  const draft = `Hello ${firstName},\n\n\n\nKind regards,\n${user.name}${team ? `\n${team}` : ""}`;
  const canEmail = can(user.role, "inquiries.email") && inquiry.status !== "deleted";
  const back = inquiry.status === "deleted" ? "/admin/inquiries/deleted" : "/admin/inquiries";

  return (
    <AdminFrame user={toPublicAdmin(user)}>
      <AdminBreadcrumb
        items={[
          { label: "Admin", href: "/admin/inquiries" },
          { label: inquiry.status === "deleted" ? "Deleted inquiries" : "Inquiries", href: back },
          { label: `Ref ${inquiryReference(inquiry.id)}` },
        ]}
      />
      <h1 className="mb-5 text-2xl font-semibold text-slate-900">Inquiry from {inquiry.name}</h1>

      <ul>
        <InquiryCard inquiry={inquiry} permissions={permissions} showDetailsLink={false} />
      </ul>

      <section aria-labelledby="activity-heading" className="mt-8">
        <h2 id="activity-heading" className="mb-3 text-lg font-semibold text-slate-900">
          Notes and activity
        </h2>
        {canAddNotes && (
          <AdminCard>
            <NoteForm inquiryId={inquiry.id} />
          </AdminCard>
        )}
        <div className={canAddNotes ? "mt-4" : ""}>
          {timeline === null ? (
            <AdminCard>
              <p role="alert" className="text-sm font-medium text-red-700">
                Notes and activity could not be loaded. Reload the page to try again.
              </p>
            </AdminCard>
          ) : (
            <InquiryTimeline entries={timeline} />
          )}
        </div>
      </section>

      <section aria-labelledby="emails-heading" className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="emails-heading" className="text-lg font-semibold text-slate-900">
            Emails
          </h2>
          {status.provider === "gmail" && status.receiving && <CheckRepliesButton />}
        </div>
        {messages === null ? (
          <AdminCard>
            <p role="alert" className="text-sm font-medium text-red-700">
              Emails could not be loaded. Reload the page to try again.
            </p>
          </AdminCard>
        ) : (
          <EmailThreadView messages={messages} />
        )}
      </section>

      {canEmail && (
        <section aria-labelledby="reply-heading" className="mt-8">
          <AdminCard>
            <h2 id="reply-heading" className="mb-4 text-lg font-semibold text-slate-900">
              Email the customer
            </h2>
            {status.sending ? (
              <ReplyForm inquiryId={inquiry.id} to={inquiry.email} subject={replySubject(inquiry.id)} draft={draft} />
            ) : (
              <p className="text-sm text-slate-700">
                Email is not set up yet, so messages cannot be sent from here.
                {can(user.role, "email.manage") ? (
                  <>
                    {" "}
                    See{" "}
                    <Link href="/admin/settings/email" className="font-semibold text-blue-800 underline underline-offset-2">
                      Settings &gt; Email
                    </Link>
                    .
                  </>
                ) : (
                  " Ask a Master Admin to set it up."
                )}
              </p>
            )}
          </AdminCard>
        </section>
      )}
    </AdminFrame>
  );
}
