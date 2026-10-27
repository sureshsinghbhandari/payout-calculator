import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";
import { adminActor, SYSTEM_ACTOR, visitorActor } from "../audit";
import type { AdminUser } from "../accounts";
import {
  acknowledgementSubject,
  acknowledgementText,
  addressOf,
  displayNameOf,
  EMAIL_DELIVERY_LABELS,
  htmlToText,
  referenceFromSubject,
  replySubject,
  storableText,
  textToHtml,
  type EmailDelivery,
  type EmailMessage,
} from "../email";
import { inquiryReference, isInquiryId, type StoredInquiry } from "../inquiry";
import { recordAudit } from "./audit-store";
import { addThreadMessage, addUnmatchedEmail, getThread, setMessageDelivery } from "./email-store";
import { findInquiryIdByReference, getInquiry, noteInquiryEmail } from "./inquiry-store";

/**
 * Email through Resend (https://resend.com). Configured with environment variables:
 * - RESEND_API_KEY: a "Full access" API key (sending and reading received emails).
 * - EMAIL_FROM: the sender, e.g. "Acme Investments <inquiries@mail.acme.com>".
 * - EMAIL_REPLY_DOMAIN: optional receiving domain for replies, e.g. "reply.acme.com".
 *   Each email gets a Reply-To like reply+<inquiry>.<signature>@reply.acme.com.
 * - RESEND_WEBHOOK_SECRET: the signing secret of the Resend webhook that posts
 *   to /api/email/inbound.
 * Without RESEND_API_KEY and EMAIL_FROM nothing is sent and the app works as before.
 */
const DOMAIN_PATTERN = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const REPLY_LOCAL = /^reply\+(\d{8}t\d{9}z-[0-9a-f]{8})\.([0-9a-f]{16})@(.+)$/i;

interface EmailEnv {
  apiKey: string | null;
  from: string | null;
  replyDomain: string | null;
  webhookSecret: string | null;
  signingSecret: string | null;
}

function readEnv(): EmailEnv {
  const value = (name: string) => process.env[name]?.trim() || null;
  const replyDomain = value("EMAIL_REPLY_DOMAIN")?.toLowerCase() ?? null;
  const signingSecret = value("ADMIN_SESSION_SECRET");
  return {
    apiKey: value("RESEND_API_KEY"),
    from: value("EMAIL_FROM"),
    replyDomain: replyDomain && DOMAIN_PATTERN.test(replyDomain) ? replyDomain : null,
    webhookSecret: value("RESEND_WEBHOOK_SECRET"),
    signingSecret: signingSecret && signingSecret.length >= 32 ? signingSecret : null,
  };
}

export interface EmailStatus {
  /** Emails can be sent. */
  sending: boolean;
  /** Customer replies are received through the webhook. */
  receiving: boolean;
  from: string | null;
  replyDomain: string | null;
  /** What is missing, in plain words. */
  problems: string[];
}

export function emailStatus(): EmailStatus {
  const env = readEnv();
  const problems: string[] = [];
  if (!env.apiKey) problems.push("RESEND_API_KEY is not set.");
  if (!env.from) problems.push("EMAIL_FROM is not set.");
  else if (!addressOf(env.from).includes("@")) problems.push("EMAIL_FROM is not a valid sender address.");
  if (!env.webhookSecret) problems.push("RESEND_WEBHOOK_SECRET is not set, so customer replies are not received.");
  if (process.env.EMAIL_REPLY_DOMAIN && !env.replyDomain) problems.push("EMAIL_REPLY_DOMAIN is not a valid domain name.");
  if (!process.env.EMAIL_REPLY_DOMAIN) {
    problems.push("EMAIL_REPLY_DOMAIN is not set, so replies are matched by the reference in the subject only.");
  }
  if (env.replyDomain && !env.signingSecret) problems.push("ADMIN_SESSION_SECRET is needed for reply addresses.");
  const sending = Boolean(env.apiKey && env.from && addressOf(env.from).includes("@"));
  return {
    sending,
    receiving: Boolean(env.apiKey && env.webhookSecret),
    from: env.from,
    replyDomain: env.replyDomain,
    problems,
  };
}

export function isEmailEnabled(): boolean {
  return emailStatus().sending;
}

function teamName(from: string): string {
  return displayNameOf(from) || "Our team";
}

// ---------- reply addresses ----------

function replySignature(inquiryId: string, secret: string): string {
  return createHmac("sha256", secret).update(`email-reply:${inquiryId}`).digest("hex").slice(0, 16);
}

/** reply+<inquiry id>.<signature>@<reply domain>, or null when replies are not set up. */
function replyAddress(inquiryId: string, env: EmailEnv): string | null {
  if (!env.replyDomain || !env.signingSecret) return null;
  return `reply+${inquiryId.toLowerCase()}.${replySignature(inquiryId, env.signingSecret)}@${env.replyDomain}`;
}

/** The inquiry id in a signed reply address, or null. */
function inquiryIdFromAddress(address: string, env: EmailEnv): string | null {
  if (!env.replyDomain || !env.signingSecret) return null;
  const match = REPLY_LOCAL.exec(addressOf(address));
  if (!match || match[3].toLowerCase() !== env.replyDomain) return null;
  const id = match[1].toLowerCase().replace("t", "T").replace("z-", "Z-");
  if (!isInquiryId(id)) return null;
  const expected = Buffer.from(replySignature(id, env.signingSecret));
  const given = Buffer.from(match[2].toLowerCase());
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

// ---------- sending ----------

type SendResult = { ok: true; message: EmailMessage } | { ok: false; error: string };

/** Sends one email about an inquiry and adds it to the inquiry's thread. */
export async function sendInquiryEmail(input: {
  inquiry: StoredInquiry;
  kind: "acknowledgement" | "reply";
  text: string;
  sentBy?: Pick<AdminUser, "id" | "name">;
  /** Message-ID of the customer email being answered. */
  inReplyTo?: string;
  idempotencyKey: string;
}): Promise<SendResult> {
  const env = readEnv();
  if (!env.apiKey || !env.from) return { ok: false, error: "Email is not set up." };
  const { inquiry } = input;
  const subject = input.kind === "acknowledgement" ? acknowledgementSubject(inquiry.id) : replySubject(inquiry.id);
  const replyTo = replyAddress(inquiry.id, env);
  const resend = new Resend(env.apiKey);
  const { data, error } = await resend.emails.send(
    {
      from: env.from,
      to: inquiry.email,
      subject,
      text: input.text,
      html: textToHtml(input.text),
      ...(replyTo ? { replyTo } : {}),
      ...(input.inReplyTo ? { headers: { "In-Reply-To": input.inReplyTo, References: input.inReplyTo } } : {}),
      tags: [
        { name: "inquiry", value: inquiry.id },
        { name: "kind", value: input.kind },
      ],
    },
    { idempotencyKey: input.idempotencyKey },
  );
  if (error || !data) return { ok: false, error: error?.message ?? "Resend did not accept the email." };

  const message: EmailMessage = {
    id: data.id,
    direction: "out",
    kind: input.kind,
    at: new Date().toISOString(),
    from: env.from,
    to: inquiry.email,
    subject,
    text: input.text,
    delivery: "sent",
    ...(input.sentBy ? { sentBy: { id: input.sentBy.id, name: input.sentBy.name } } : {}),
  };
  try {
    if (await addThreadMessage(inquiry.id, message)) await noteInquiryEmail(inquiry.id, "out", message.at);
  } catch (saveError) {
    // The email has gone; only the copy on the inquiry page is missing.
    console.error("Saving sent email failed", inquiry.id, data.id, saveError);
  }
  return { ok: true, message };
}

/** Emails the visitor a thank-you with their reference number. Never throws; the result is in the audit log. */
export async function sendAcknowledgement(inquiry: StoredInquiry): Promise<void> {
  const env = readEnv();
  if (!env.apiKey || !env.from) return;
  const ref = inquiryReference(inquiry.id);
  const target = { type: "inquiry" as const, id: inquiry.id, label: `${ref} (${inquiry.name})` };
  try {
    const result = await sendInquiryEmail({
      inquiry,
      kind: "acknowledgement",
      text: acknowledgementText(inquiry, teamName(env.from)),
      idempotencyKey: `ack-${inquiry.id}`,
    });
    recordAudit({
      actor: SYSTEM_ACTOR,
      category: "email",
      action: result.ok ? "email.acknowledgement" : "email.failed",
      summary: result.ok
        ? `Sent the acknowledgement for inquiry ${ref} to ${inquiry.email}`
        : `Could not send the acknowledgement for inquiry ${ref} to ${inquiry.email}: ${result.error}`,
      target,
    });
  } catch (error) {
    console.error("Sending acknowledgement failed", error);
    recordAudit({
      actor: SYSTEM_ACTOR,
      category: "email",
      action: "email.failed",
      summary: `Could not send the acknowledgement for inquiry ${ref} to ${inquiry.email}`,
      target,
    });
  }
}

/** Message-ID of the latest customer email in a thread, to thread a staff reply. */
export async function latestCustomerMessageId(inquiryId: string): Promise<string | undefined> {
  const thread = await getThread(inquiryId);
  return thread.messages.filter((m) => m.direction === "in" && m.messageId).pop()?.messageId;
}

/** Sends a test email (Settings > Email). */
export async function sendTestEmail(to: string, user: Pick<AdminUser, "id" | "name" | "username" | "role">): Promise<{ ok: true } | { ok: false; error: string }> {
  const env = readEnv();
  if (!env.apiKey || !env.from) return { ok: false, error: "Email is not set up." };
  const text = [
    "Hello,",
    "",
    `This is a test email from the Investment Payout Calculator admin, sent by ${user.name}.`,
    "If you received it, sending works.",
    "",
    teamName(env.from),
  ].join("\n");
  const replyTo = env.replyDomain ? `test@${env.replyDomain}` : null;
  const { error } = await new Resend(env.apiKey).emails.send({
    from: env.from,
    to,
    subject: "Test email from the Investment Payout Calculator",
    text,
    html: textToHtml(text),
    ...(replyTo ? { replyTo } : {}),
    tags: [{ name: "kind", value: "test" }],
  });
  recordAudit({
    actor: adminActor(user),
    category: "email",
    action: error ? "email.test_failed" : "email.test",
    summary: error ? `Test email to ${to} failed: ${error.message}` : `Sent a test email to ${to}`,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---------- webhook ----------

const DELIVERY_EVENTS: Partial<Record<string, EmailDelivery>> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.failed": "failed",
  "email.complained": "complained",
};

/**
 * Handles a Resend webhook request. Returns the HTTP status to answer with:
 * 401 for a bad signature, 500 to make Resend retry, otherwise 200.
 */
export async function handleEmailWebhook(payload: string, headers: Headers): Promise<number> {
  const env = readEnv();
  if (!env.apiKey || !env.webhookSecret) return 503;
  const header = (name: string) => headers.get(`svix-${name}`) ?? headers.get(`webhook-${name}`) ?? "";
  const resend = new Resend(env.apiKey);
  let event;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: { id: header("id"), timestamp: header("timestamp"), signature: header("signature") },
      webhookSecret: env.webhookSecret,
    });
  } catch {
    return 401;
  }

  try {
    if (event.type === "email.received") {
      await receiveEmail(resend, env, event.data);
      return 200;
    }
    const delivery = DELIVERY_EVENTS[event.type];
    if (delivery && "email_id" in event.data) {
      const data = event.data as { email_id: string; message_id?: string; tags?: Record<string, string>; to?: string[] };
      const inquiryId = data.tags?.inquiry;
      if (!inquiryId || !isInquiryId(inquiryId)) return 200;
      const note =
        "bounce" in event.data
          ? (event.data as { bounce?: { message?: string } }).bounce?.message
          : "failed" in event.data
            ? (event.data as { failed?: { reason?: string } }).failed?.reason
            : undefined;
      const updated = await setMessageDelivery(inquiryId, data.email_id, delivery, note, data.message_id);
      if (updated && delivery !== "delivered") {
        const inquiry = await getInquiry(inquiryId);
        const ref = inquiryReference(inquiryId);
        recordAudit({
          actor: SYSTEM_ACTOR,
          category: "email",
          action: `email.${delivery}`,
          summary: `Email to ${updated.to} for inquiry ${ref}: ${EMAIL_DELIVERY_LABELS[delivery].toLowerCase()}${note ? ` (${note})` : ""}`,
          target: { type: "inquiry", id: inquiryId, label: inquiry ? `${ref} (${inquiry.name})` : ref },
        });
      }
    }
    return 200;
  } catch (error) {
    console.error("Handling email webhook failed", event.type, error);
    return 500;
  }
}

async function receiveEmail(
  resend: Resend,
  env: EmailEnv,
  data: { email_id: string; created_at: string; from: string; to: string[]; received_for?: string[]; subject: string; message_id: string },
): Promise<void> {
  const recipients = [...(data.received_for ?? []), ...data.to];
  let inquiryId = recipients.map((r) => inquiryIdFromAddress(r, env)).find((id): id is string => id !== null) ?? null;
  if (!inquiryId) {
    const ref = referenceFromSubject(data.subject ?? "");
    if (ref) inquiryId = await findInquiryIdByReference(ref);
  }

  const { data: full, error } = await resend.emails.receiving.get(data.email_id);
  if (error || !full) throw new Error(`Could not fetch received email: ${error?.message ?? "no data"}`);
  const text = storableText(full.text?.trim() ? full.text : full.html ? htmlToText(full.html) : "");
  const at = data.created_at || full.created_at || new Date().toISOString();
  const from = full.from || data.from;
  const fromAddress = addressOf(from);
  const subject = (full.subject || data.subject || "(no subject)").slice(0, 300);

  const inquiry = inquiryId ? await getInquiry(inquiryId) : null;
  if (!inquiry) {
    const added = await addUnmatchedEmail({
      id: data.email_id,
      at,
      from,
      to: recipients[0] ?? "",
      subject,
      text,
    });
    if (added) {
      recordAudit({
        actor: visitorActor(displayNameOf(from) || fromAddress),
        category: "customer",
        action: "email.unmatched",
        summary: `Email from ${fromAddress} did not match an inquiry: "${subject}"`,
      });
    }
    return;
  }

  const message: EmailMessage = {
    id: data.email_id,
    direction: "in",
    kind: "customer",
    at,
    from,
    to: recipients[0] ?? "",
    subject,
    text,
    ...(full.message_id || data.message_id ? { messageId: full.message_id || data.message_id } : {}),
  };
  if (!(await addThreadMessage(inquiry.id, message))) return;
  await noteInquiryEmail(inquiry.id, "in", at);
  const ref = inquiryReference(inquiry.id);
  recordAudit({
    actor: visitorActor(inquiry.name),
    category: "customer",
    action: "email.received",
    summary: `Email from ${fromAddress} on inquiry ${ref}: "${subject}"`,
    target: { type: "inquiry", id: inquiry.id, label: `${ref} (${inquiry.name})` },
  });
}
