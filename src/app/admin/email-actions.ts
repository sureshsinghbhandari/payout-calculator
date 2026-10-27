"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { adminActor } from "@/lib/audit";
import { EMAIL_LIMITS } from "@/lib/email";
import { inquiryReference, isInquiryId } from "@/lib/inquiry";
import { recordAudit } from "@/lib/server/audit-store";
import { requireAdminPermission } from "@/lib/server/auth";
import { isEmailEnabled, latestCustomerMessageId, sendInquiryEmail, sendTestEmail } from "@/lib/server/email";
import { getInquiry, setInquiryStatus } from "@/lib/server/inquiry-store";

export interface ReplyState {
  status: "idle" | "sent" | "error";
  message?: string;
  /** What the admin typed, kept after an error. */
  text?: string;
}

/** Emails the customer of an inquiry (Master and Sales Admins). Marks a new inquiry as contacted. */
export async function sendInquiryReplyAction(_prev: ReplyState, formData: FormData): Promise<ReplyState> {
  const user = await requireAdminPermission("inquiries.email");
  if (!user) return { status: "error", message: "You do not have permission to email customers." };
  const id = formData.get("id");
  const raw = formData.get("text");
  const text = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  if (typeof id !== "string" || !isInquiryId(id)) return { status: "error", message: "This inquiry was not found." };
  if (text === "") return { status: "error", message: "Write a message first.", text };
  if (text.length > EMAIL_LIMITS.reply) {
    return { status: "error", message: `Use at most ${EMAIL_LIMITS.reply} characters.`, text };
  }
  if (!isEmailEnabled()) return { status: "error", message: "Email is not set up yet.", text };

  const inquiry = await getInquiry(id);
  if (!inquiry || inquiry.status === "deleted") {
    return { status: "error", message: "This inquiry was not found or is deleted.", text };
  }

  const ref = inquiryReference(inquiry.id);
  const target = { type: "inquiry" as const, id: inquiry.id, label: `${ref} (${inquiry.name})` };
  try {
    const result = await sendInquiryEmail({
      inquiry,
      kind: "reply",
      text,
      sentBy: user,
      inReplyTo: await latestCustomerMessageId(inquiry.id),
      // A new key per submission; double submits are blocked by the pending button.
      idempotencyKey: `reply-${inquiry.id}-${randomBytes(6).toString("hex")}`,
    });
    if (!result.ok) {
      recordAudit({
        actor: adminActor(user),
        category: "email",
        action: "email.failed",
        summary: `Could not email ${inquiry.email} about inquiry ${ref}: ${result.error}`,
        target,
      });
      return { status: "error", message: `The email was not sent: ${result.error}`, text };
    }
    recordAudit({
      actor: adminActor(user),
      category: "email",
      action: "email.reply",
      summary: `Emailed ${inquiry.email} about inquiry ${ref}`,
      target,
    });
    if (inquiry.status === "new") {
      const updated = await setInquiryStatus(inquiry.id, "contacted");
      if (updated) {
        recordAudit({
          actor: adminActor(user),
          category: "inquiry",
          action: "inquiry.status",
          summary: `Marked inquiry ${ref} (${inquiry.name}) as contacted after emailing them`,
          target,
        });
      }
    }
  } catch (error) {
    console.error("Sending reply failed", error);
    return { status: "error", message: "The email could not be sent. Try again.", text };
  }
  refresh();
  return { status: "sent", message: `Sent to ${inquiry.email}.` };
}

export interface TestEmailState {
  status: "idle" | "sent" | "error";
  message?: string;
  to?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Sends a test email (Master Admin, Settings > Email). */
export async function sendTestEmailAction(_prev: TestEmailState, formData: FormData): Promise<TestEmailState> {
  const user = await requireAdminPermission("email.manage");
  if (!user) return { status: "error", message: "You do not have permission to do this." };
  const raw = formData.get("to");
  const to = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(to) || to.length > 254) {
    return { status: "error", message: "Enter a valid email address.", to };
  }
  try {
    const result = await sendTestEmail(to, user);
    return result.ok
      ? { status: "sent", message: `Test email sent to ${to}. Check that inbox (and its spam folder).`, to }
      : { status: "error", message: `Not sent: ${result.error}`, to };
  } catch (error) {
    console.error("Sending test email failed", error);
    return { status: "error", message: "The test email could not be sent.", to };
  }
}
