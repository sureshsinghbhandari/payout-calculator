import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";
import { adminActor, SYSTEM_ACTOR, visitorActor } from "../audit";
import { SETUP_LINK_HOURS, type AdminUser } from "../accounts";
import {
  acknowledgementSubject,
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
import { firstNameOf, inquiryTemplateValues, renderTemplate } from "../email-templates";
import { inquiryReference, isInquiryId, type StoredInquiry } from "../inquiry";
import { listAdminUsers } from "./accounts-store";
import { recordAudit } from "./audit-store";
import { scanGmailInbox, sendViaGmail, type GmailAccount, type InboxEnvelope } from "./email-gmail";
import {
  addThreadMessage,
  addUnmatchedEmail,
  getThread,
  readGmailState,
  saveGmailState,
  setMessageDelivery,
  type GmailCheckState,
} from "./email-store";
import { getEmailTemplate } from "./email-templates-store";
import { findInquiryIdByReference, getInquiry, noteInquiryEmail } from "./inquiry-store";

/**
 * Email for inquiries, through one of two providers chosen with EMAIL_PROVIDER:
 *
 * "gmail" (for now): sends through Gmail and checks the inbox for replies.
 * - GMAIL_USER: the Gmail address, e.g. acme.investments@gmail.com.
 * - GMAIL_APP_PASSWORD: a Google app password (needs 2-Step Verification).
 * Customer replies go to GMAIL_USER+<inquiry>.<signature>@gmail.com, which Gmail
 * delivers to the same inbox. The inbox is checked when admins open inquiries.
 *
 * "resend" (later, with a company domain):
 * - RESEND_API_KEY: a "Full access" API key.
 * - EMAIL_FROM: the sender, e.g. "Acme Investments <inquiries@mail.acme.com>".
 * - EMAIL_REPLY_DOMAIN: receiving domain for replies, e.g. "reply.acme.com".
 * - RESEND_WEBHOOK_SECRET: signing secret of the webhook to /api/email/inbound.
 *
 * EMAIL_SENDER_NAME (optional) is the name customers see, e.g. "Acme Investments".
 * Without EMAIL_PROVIDER, Resend is used when it is set up, otherwise Gmail.
 * When neither is set up nothing is sent and the app works as before.
 */
export type EmailProvider = "gmail" | "resend";

export const EMAIL_PROVIDER_LABELS: Record<EmailProvider, string> = {
  gmail: "Gmail",
  resend: "Resend",
};

const DOMAIN_PATTERN = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const SIMPLE_ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
const PLUS_ADDRESS = /^([^+@\s]+)\+(\d{8}t\d{9}z-[0-9a-f]{8})\.([0-9a-f]{16})@([^@\s]+)$/i;
/** Minimum time between automatic Gmail inbox checks. */
const GMAIL_CHECK_INTERVAL_MS = 60_000;

interface EmailEnv {
  provider: EmailProvider | null;
  /** Problem with EMAIL_PROVIDER itself. */
  providerProblem: string | null;
  senderName: string | null;
  signingSecret: string | null;
  resend: { apiKey: string | null; from: string | null; replyDomain: string | null; webhookSecret: string | null };
  gmail: GmailAccount | null;
}

function readEnv(): EmailEnv {
  const value = (name: string) => process.env[name]?.trim() || null;
  const replyDomain = value("EMAIL_REPLY_DOMAIN")?.toLowerCase() ?? null;
  const signingSecret = value("ADMIN_SESSION_SECRET");
  const gmailUser = value("GMAIL_USER")?.toLowerCase() ?? null;
  // Google shows app passwords in groups of four ("abcd efgh ijkl mnop").
  const gmailPassword = value("GMAIL_APP_PASSWORD")?.replace(/\s+/g, "") ?? null;
  const resend = {
    apiKey: value("RESEND_API_KEY"),
    from: value("EMAIL_FROM"),
    replyDomain: replyDomain && DOMAIN_PATTERN.test(replyDomain) ? replyDomain : null,
    webhookSecret: value("RESEND_WEBHOOK_SECRET"),
  };
  const gmail = gmailUser && gmailPassword && SIMPLE_ADDRESS.test(gmailUser) ? { user: gmailUser, password: gmailPassword } : null;

  const chosen = value("EMAIL_PROVIDER")?.toLowerCase() ?? null;
  let provider: EmailProvider | null = null;
  let providerProblem: string | null = null;
  if (chosen === "gmail" || chosen === "resend") provider = chosen;
  else if (chosen) providerProblem = `EMAIL_PROVIDER must be "gmail" or "resend", not "${chosen}".`;
  else provider = resend.apiKey && resend.from ? "resend" : gmail ? "gmail" : null;

  return {
    provider,
    providerProblem,
    senderName: value("EMAIL_SENDER_NAME"),
    signingSecret: signingSecret && signingSecret.length >= 32 ? signingSecret : null,
    resend,
    gmail,
  };
}

/** The From header for the active provider, or null when it is not set up. */
function senderOf(env: EmailEnv): string | null {
  if (env.provider === "gmail") {
    if (!env.gmail) return null;
    return env.senderName ? `${env.senderName} <${env.gmail.user}>` : env.gmail.user;
  }
  if (env.provider === "resend") {
    const from = env.resend.from;
    if (!env.resend.apiKey || !from || !addressOf(from).includes("@")) return null;
    return env.senderName && !displayNameOf(from) ? `${env.senderName} <${addressOf(from)}>` : from;
  }
  return null;
}

function teamName(env: EmailEnv, from: string): string {
  return displayNameOf(from) || env.senderName || "Our team";
}

/** The team name emails are signed with (for template previews). */
export function emailTeamName(): string {
  const env = readEnv();
  const from = senderOf(env);
  return from ? teamName(env, from) : env.senderName || "Our team";
}

export interface EmailStatus {
  provider: EmailProvider | null;
  /** Emails can be sent. */
  sending: boolean;
  /** Customer replies come back into the app. */
  receiving: boolean;
  from: string | null;
  /** Example reply address, or null when replies go to the sender address. */
  replyAddress: string | null;
  /** What is missing, in plain words. */
  problems: string[];
}

export function emailStatus(): EmailStatus {
  const env = readEnv();
  const problems: string[] = [];
  if (env.providerProblem) problems.push(env.providerProblem);
  const from = senderOf(env);

  if (!env.provider && !env.providerProblem) {
    problems.push("No email provider is set up. Set EMAIL_PROVIDER to gmail (with GMAIL_USER and GMAIL_APP_PASSWORD) or resend.");
  } else if (env.provider === "gmail") {
    if (!process.env.GMAIL_USER?.trim()) problems.push("GMAIL_USER is not set.");
    else if (!SIMPLE_ADDRESS.test(process.env.GMAIL_USER.trim())) problems.push("GMAIL_USER is not a valid email address.");
    if (!process.env.GMAIL_APP_PASSWORD?.trim()) problems.push("GMAIL_APP_PASSWORD is not set.");
    if (!env.signingSecret) problems.push("ADMIN_SESSION_SECRET is needed for reply addresses.");
  } else if (env.provider === "resend") {
    if (!env.resend.apiKey) problems.push("RESEND_API_KEY is not set.");
    if (!env.resend.from) problems.push("EMAIL_FROM is not set.");
    else if (!addressOf(env.resend.from).includes("@")) problems.push("EMAIL_FROM is not a valid sender address.");
    else if (addressOf(env.resend.from).endsWith("@resend.dev")) {
      problems.push("EMAIL_FROM uses Resend's test address, so emails only reach the Resend account owner until a domain is verified.");
    }
    if (!env.resend.webhookSecret) problems.push("RESEND_WEBHOOK_SECRET is not set, so customer replies are not received.");
    if (process.env.EMAIL_REPLY_DOMAIN && !env.resend.replyDomain) problems.push("EMAIL_REPLY_DOMAIN is not a valid domain name.");
    if (!process.env.EMAIL_REPLY_DOMAIN) problems.push("EMAIL_REPLY_DOMAIN is not set, so customer replies do not come back into the app.");
    if (env.resend.replyDomain && !env.signingSecret) problems.push("ADMIN_SESSION_SECRET is needed for reply addresses.");
  }

  const sending = from !== null;
  const receiving =
    env.provider === "gmail"
      ? sending
      : env.provider === "resend"
        ? Boolean(sending && env.resend.webhookSecret && env.resend.replyDomain)
        : false;
  return {
    provider: env.provider,
    sending,
    receiving,
    from,
    replyAddress: replyBase(env) ? `${replyBase(env)!.local}+…@${replyBase(env)!.domain}` : null,
    problems,
  };
}

export function isEmailEnabled(): boolean {
  return emailStatus().sending;
}

// ---------- reply addresses ----------

/** Local part and domain that reply addresses are built on, for the active provider. */
function replyBase(env: EmailEnv): { local: string; domain: string } | null {
  if (!env.signingSecret) return null;
  if (env.provider === "gmail" && env.gmail) {
    const [local, domain] = env.gmail.user.split("@");
    return { local, domain };
  }
  if (env.provider === "resend" && env.resend.replyDomain) return { local: "reply", domain: env.resend.replyDomain };
  return null;
}

function replySignature(inquiryId: string, secret: string): string {
  return createHmac("sha256", secret).update(`email-reply:${inquiryId}`).digest("hex").slice(0, 16);
}

/** <base>+<inquiry id>.<signature>@<domain>, or null when replies are not set up. */
function replyAddress(inquiryId: string, env: EmailEnv): string | null {
  const base = replyBase(env);
  if (!base || !env.signingSecret) return null;
  return `${base.local}+${inquiryId.toLowerCase()}.${replySignature(inquiryId, env.signingSecret)}@${base.domain}`;
}

/** Gmail ignores dots in the local part of gmail.com addresses. */
function sameLocal(a: string, b: string, domain: string): boolean {
  const norm = (s: string) => (/^(gmail|googlemail)\.com$/.test(domain) ? s.replace(/\./g, "") : s).toLowerCase();
  return norm(a) === norm(b);
}

/** The inquiry id in a signed reply address of either provider, or null. */
function inquiryIdFromAddress(address: string, env: EmailEnv): string | null {
  if (!env.signingSecret) return null;
  const match = PLUS_ADDRESS.exec(addressOf(address));
  if (!match) return null;
  const [, local, rawId, signature, domain] = match;
  const bases = [
    env.gmail ? { local: env.gmail.user.split("@")[0], domain: env.gmail.user.split("@")[1] } : null,
    env.resend.replyDomain ? { local: "reply", domain: env.resend.replyDomain } : null,
  ];
  if (!bases.some((b) => b && b.domain === domain.toLowerCase() && sameLocal(b.local, local, b.domain))) return null;
  const id = rawId.toLowerCase().replace("t", "T").replace("z-", "Z-");
  if (!isInquiryId(id)) return null;
  const expected = Buffer.from(replySignature(id, env.signingSecret));
  const given = Buffer.from(signature.toLowerCase());
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

// ---------- sending ----------

interface Outgoing {
  to: string;
  subject: string;
  text: string;
  replyTo?: string | null;
  inReplyTo?: string;
  tags: Record<string, string>;
  idempotencyKey?: string;
}

type DeliverResult = { ok: true; id: string; messageId?: string } | { ok: false; error: string };

/** Sends one email with the active provider. */
async function deliver(env: EmailEnv, from: string, mail: Outgoing): Promise<DeliverResult> {
  const html = textToHtml(mail.text);
  if (env.provider === "gmail" && env.gmail) {
    const result = await sendViaGmail(env.gmail, {
      from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html,
      ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
      ...(mail.inReplyTo ? { inReplyTo: mail.inReplyTo } : {}),
    });
    return result.ok ? { ok: true, id: `gmail:${result.messageId}`, messageId: result.messageId } : result;
  }
  if (env.provider === "resend" && env.resend.apiKey) {
    const { data, error } = await new Resend(env.resend.apiKey).emails.send(
      {
        from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html,
        ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
        ...(mail.inReplyTo ? { headers: { "In-Reply-To": mail.inReplyTo, References: mail.inReplyTo } } : {}),
        tags: Object.entries(mail.tags).map(([name, value]) => ({ name, value })),
      },
      mail.idempotencyKey ? { idempotencyKey: mail.idempotencyKey } : undefined,
    );
    return error || !data ? { ok: false, error: error?.message ?? "Resend did not accept the email." } : { ok: true, id: data.id };
  }
  return { ok: false, error: "Email is not set up." };
}

type SendResult = { ok: true; message: EmailMessage } | { ok: false; error: string };

/** Sends one email about an inquiry and adds it to the inquiry's thread. */
export async function sendInquiryEmail(input: {
  inquiry: StoredInquiry;
  kind: "acknowledgement" | "reply";
  text: string;
  /** Subject from a template; the standard subject for the kind when missing. */
  subject?: string;
  sentBy?: Pick<AdminUser, "id" | "name">;
  /** Message-ID of the customer email being answered. */
  inReplyTo?: string;
  idempotencyKey: string;
}): Promise<SendResult> {
  const env = readEnv();
  const from = senderOf(env);
  if (!from) return { ok: false, error: "Email is not set up." };
  const { inquiry } = input;
  const subject = input.subject ?? (input.kind === "acknowledgement" ? acknowledgementSubject(inquiry.id) : replySubject(inquiry.id));
  const result = await deliver(env, from, {
    to: inquiry.email,
    subject,
    text: input.text,
    replyTo: replyAddress(inquiry.id, env),
    ...(input.inReplyTo ? { inReplyTo: input.inReplyTo } : {}),
    tags: { inquiry: inquiry.id, kind: input.kind },
    idempotencyKey: input.idempotencyKey,
  });
  if (!result.ok) return result;

  const message: EmailMessage = {
    id: result.id,
    direction: "out",
    kind: input.kind,
    at: new Date().toISOString(),
    from,
    to: inquiry.email,
    subject,
    text: input.text,
    delivery: "sent",
    ...(result.messageId ? { messageId: result.messageId } : {}),
    ...(input.sentBy ? { sentBy: { id: input.sentBy.id, name: input.sentBy.name } } : {}),
  };
  try {
    if (await addThreadMessage(inquiry.id, message)) await noteInquiryEmail(inquiry.id, "out", message.at);
  } catch (saveError) {
    // The email has gone; only the copy on the inquiry page is missing.
    console.error("Saving sent email failed", inquiry.id, result.id, saveError);
  }
  return { ok: true, message };
}

/** Emails the visitor a thank-you with their reference number. Never throws; the result is in the audit log. */
export async function sendAcknowledgement(inquiry: StoredInquiry): Promise<void> {
  const env = readEnv();
  const from = senderOf(env);
  if (!from) return;
  const ref = inquiryReference(inquiry.id);
  const target = { type: "inquiry" as const, id: inquiry.id, label: `${ref} (${inquiry.name})` };
  try {
    // The saved template (Settings > Email templates), or the default wording.
    const email = renderTemplate(await getEmailTemplate("acknowledgement"), inquiryTemplateValues(inquiry, teamName(env, from)));
    const result = await sendInquiryEmail({
      inquiry,
      kind: "acknowledgement",
      subject: email.subject,
      text: email.body,
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

/**
 * Emails each active admin who has an email address and new inquiry alerts on
 * (My account). `origin` is the site address for the link, e.g.
 * "https://example.com". The earnings rate is never included. Records one
 * audit event for the batch. Never throws; does nothing when email is not set up.
 */
export async function sendInquiryAlerts(inquiry: StoredInquiry, origin: string): Promise<void> {
  const env = readEnv();
  const from = senderOf(env);
  if (!from) return;
  const ref = inquiryReference(inquiry.id);
  const target = { type: "inquiry" as const, id: inquiry.id, label: `${ref} (${inquiry.name})` };
  try {
    const recipients = (await listAdminUsers()).filter((u) => u.active && u.email && u.inquiryAlerts);
    if (recipients.length === 0) return;
    const link = `${origin}/admin/inquiries/${encodeURIComponent(inquiry.id)}`;
    const email = renderTemplate(await getEmailTemplate("alert"), inquiryTemplateValues(inquiry, teamName(env, from), link));

    const sent: string[] = [];
    const failed: string[] = [];
    // One email per admin, so admins do not see each other's addresses.
    for (const admin of recipients) {
      const result = await deliver(env, from, {
        to: admin.email!,
        subject: email.subject,
        text: email.body,
        tags: { kind: "alert" },
        idempotencyKey: `alert-${inquiry.id}-${admin.id}`,
      }).catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : "Sending failed." }));
      if (result.ok) sent.push(admin.name);
      else failed.push(`${admin.name} (${result.error})`);
    }

    recordAudit({
      actor: SYSTEM_ACTOR,
      category: "email",
      action: sent.length > 0 ? "email.inquiry_alert" : "email.failed",
      summary:
        sent.length > 0
          ? `Emailed the new inquiry alert for ${ref} to ${sent.join(", ")}${failed.length > 0 ? `; could not reach ${failed.join(", ")}` : ""}`
          : `Could not email the new inquiry alert for ${ref} to ${failed.join(", ")}`,
      target,
    });
  } catch (error) {
    console.error("Sending new inquiry alerts failed", error);
    recordAudit({
      actor: SYSTEM_ACTOR,
      category: "email",
      action: "email.failed",
      summary: `Could not send the new inquiry alerts for ${ref}`,
      target,
    });
  }
}

/** Emails a password reset link (Forgot password). The caller records the audit event. */
export async function sendPasswordResetEmail(input: {
  to: string;
  name: string;
  username: string;
  link: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const env = readEnv();
  const from = senderOf(env);
  if (!from) return { ok: false, error: "Email is not set up." };
  const email = renderTemplate(await getEmailTemplate("reset"), {
    name: input.name,
    firstName: firstNameOf(input.name),
    username: input.username,
    link: input.link,
    hours: String(SETUP_LINK_HOURS),
    team: teamName(env, from),
  });
  const result = await deliver(env, from, { to: input.to, subject: email.subject, text: email.body, tags: { kind: "password-reset" } });
  return result.ok ? { ok: true } : result;
}

export type PayoutEmailSend = (
  to: string,
  values: Record<string, string>,
  idempotencyKey: string,
) => Promise<{ ok: true } | { ok: false; error: string }>;

/**
 * A sender for one payout email template (payout reminder or payment
 * confirmation), with the template read once; null when email is not set up.
 * `values` are the placeholder values without {team}. The caller records the
 * audit event. Sending never throws.
 */
export async function payoutEmailSender(key: "payoutReminder" | "paymentConfirmation"): Promise<PayoutEmailSend | null> {
  const env = readEnv();
  const from = senderOf(env);
  if (!from) return null;
  const template = await getEmailTemplate(key);
  const team = teamName(env, from);
  return async (to, values, idempotencyKey) => {
    try {
      const email = renderTemplate(template, { ...values, team });
      const result = await deliver(env, from, {
        to,
        subject: email.subject,
        text: email.body,
        tags: { kind: key === "payoutReminder" ? "payout-reminder" : "payment-confirmation" },
        idempotencyKey,
      });
      return result.ok ? { ok: true } : result;
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Sending failed." };
    }
  };
}

/**
 * Tells an investor that a new document is in their portal (no attachment:
 * they sign in to download it). Records the result in the audit log. Never
 * throws; does nothing when email is not set up.
 */
export async function sendDocumentNotice(input: {
  investor: { id: string; name: string; username: string; email: string };
  title: string;
  /** Site address for the portal link, e.g. "https://example.com". */
  origin: string;
}): Promise<void> {
  const env = readEnv();
  const from = senderOf(env);
  const { investor } = input;
  if (!from || !investor.email) return;
  const target = { type: "investor" as const, id: investor.id, label: `${investor.name} (${investor.username})` };
  const text = [
    `Hello ${firstNameOf(investor.name)},`,
    "",
    `A new document, "${input.title}", is available in your investor portal.`,
    "",
    "To download it, sign in here:",
    `${input.origin}/portal`,
    "",
    "Kind regards,",
    teamName(env, from),
  ].join("\n");
  try {
    const result = await deliver(env, from, {
      to: investor.email,
      subject: "A new document is available",
      text,
      tags: { kind: "document-notice" },
    });
    recordAudit({
      actor: SYSTEM_ACTOR,
      category: "email",
      action: result.ok ? "email.document_notice" : "email.failed",
      summary: result.ok
        ? `Emailed ${investor.name} (${investor.username}) at ${investor.email} that the document "${input.title}" is available`
        : `Could not email ${investor.name} (${investor.username}) about the document "${input.title}": ${result.error}`,
      target,
    });
  } catch (error) {
    console.error("Sending document notice failed", error);
    recordAudit({
      actor: SYSTEM_ACTOR,
      category: "email",
      action: "email.failed",
      summary: `Could not email ${investor.name} (${investor.username}) about the document "${input.title}"`,
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
export async function sendTestEmail(
  to: string,
  user: Pick<AdminUser, "id" | "name" | "username" | "role">,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const env = readEnv();
  const from = senderOf(env);
  if (!from) return { ok: false, error: "Email is not set up." };
  const text = [
    "Hello,",
    "",
    `This is a test email from the Investment Payout Calculator admin, sent by ${user.name} through ${EMAIL_PROVIDER_LABELS[env.provider!]}.`,
    "If you received it, sending works.",
    "",
    teamName(env, from),
  ].join("\n");
  const result = await deliver(env, from, {
    to,
    subject: "Test email from the Investment Payout Calculator",
    text,
    tags: { kind: "test" },
  });
  recordAudit({
    actor: adminActor(user),
    category: "email",
    action: result.ok ? "email.test" : "email.test_failed",
    summary: result.ok ? `Sent a test email to ${to}` : `Test email to ${to} failed: ${result.error}`,
  });
  return result.ok ? { ok: true } : result;
}

// ---------- receiving (shared) ----------

interface ReceivedEmail {
  /** Provider id, unique per email (used to ignore repeats). */
  id: string;
  at: string;
  from: string;
  fromName: string;
  recipients: string[];
  subject: string;
  text: string;
  messageId: string | null;
}

/**
 * Attaches a received email to its inquiry: by signed reply address, otherwise
 * by "Ref XXXXXXXX" in the subject (when `senderMustMatch`, only if it comes
 * from the inquiry's email address). Unmatched emails are kept only when
 * `keepUnmatched` (never for a Gmail inbox, which also holds unrelated mail).
 */
async function recordReceivedEmail(
  env: EmailEnv,
  email: ReceivedEmail,
  options: { keepUnmatched: boolean; senderMustMatch: boolean },
): Promise<"added" | "duplicate" | "unmatched" | "ignored"> {
  const fromAddress = addressOf(email.from);
  let inquiryId = email.recipients.map((r) => inquiryIdFromAddress(r, env)).find((id): id is string => id !== null) ?? null;
  let byReference = false;
  if (!inquiryId) {
    const ref = referenceFromSubject(email.subject);
    if (ref) {
      inquiryId = await findInquiryIdByReference(ref);
      byReference = true;
    }
  }
  let inquiry = inquiryId ? await getInquiry(inquiryId) : null;
  if (inquiry && byReference && options.senderMustMatch && inquiry.email !== fromAddress) inquiry = null;

  const subject = (email.subject || "(no subject)").slice(0, 300);
  const text = storableText(email.text);
  if (!inquiry) {
    if (!options.keepUnmatched) return "ignored";
    const added = await addUnmatchedEmail({ id: email.id, at: email.at, from: email.from, to: email.recipients[0] ?? "", subject, text });
    if (added) {
      recordAudit({
        actor: visitorActor(email.fromName || fromAddress),
        category: "customer",
        action: "email.unmatched",
        summary: `Email from ${fromAddress} did not match an inquiry: "${subject}"`,
      });
    }
    return "unmatched";
  }

  const message: EmailMessage = {
    id: email.id,
    direction: "in",
    kind: "customer",
    at: email.at,
    from: email.from,
    to: email.recipients[0] ?? "",
    subject,
    text,
    ...(email.messageId ? { messageId: email.messageId } : {}),
  };
  if (!(await addThreadMessage(inquiry.id, message))) return "duplicate";
  await noteInquiryEmail(inquiry.id, "in", email.at);
  const ref = inquiryReference(inquiry.id);
  recordAudit({
    actor: visitorActor(inquiry.name),
    category: "customer",
    action: "email.received",
    summary: `Email from ${fromAddress} on inquiry ${ref}: "${subject}"`,
    target: { type: "inquiry", id: inquiry.id, label: `${ref} (${inquiry.name})` },
  });
  return "added";
}

// ---------- receiving: Gmail inbox ----------

export interface GmailCheckResult {
  ok: boolean;
  /** Replies added to inquiries. */
  added: number;
  error?: string;
  /** False when the check was skipped (not Gmail, or checked moments ago). */
  checked: boolean;
}

/**
 * Checks the Gmail inbox for customer replies. Only messages sent to a reply
 * address, or with an inquiry reference in the subject, are downloaded; the
 * rest of the inbox is never read or stored. Without `force`, does nothing if
 * the inbox was checked in the last minute.
 */
export async function checkGmailReplies(force = false): Promise<GmailCheckResult> {
  const env = readEnv();
  if (env.provider !== "gmail" || !env.gmail) return { ok: true, added: 0, checked: false };
  const account = env.gmail;
  const own = account.user;
  const state = await readGmailState();
  const now = new Date();
  if (!force && state.checkedAt && now.getTime() - Date.parse(state.checkedAt) < GMAIL_CHECK_INTERVAL_MS) {
    return { ok: true, added: 0, checked: false };
  }
  // Mark the check as started so pages opened at the same moment do not all check.
  await saveGmailState({ ...state, checkedAt: now.toISOString() });

  const wanted = (e: InboxEnvelope) =>
    e.recipients.some((r) => inquiryIdFromAddress(r, env) !== null) ||
    (referenceFromSubject(e.subject) !== null && e.from !== own);

  let next: GmailCheckState;
  let added = 0;
  try {
    const scan = await scanGmailInbox(
      account,
      state.uidValidity ? { uidValidity: state.uidValidity, lastUid: state.lastUid } : null,
      wanted,
    );
    for (const m of scan.messages) {
      const outcome = await recordReceivedEmail(
        env,
        {
          id: `gmail:${scan.uidValidity}:${m.uid}`,
          at: m.date && !Number.isNaN(Date.parse(m.date)) ? new Date(m.date).toISOString() : now.toISOString(),
          from: m.fromName ? `${m.fromName} <${m.from}>` : m.from,
          fromName: m.fromName,
          recipients: m.recipients,
          subject: m.subject,
          text: m.text.trim() ? m.text : m.html ? htmlToText(m.html) : "",
          messageId: m.messageId,
        },
        { keepUnmatched: false, senderMustMatch: true },
      );
      if (outcome === "added") added++;
    }
    next = { uidValidity: scan.uidValidity, lastUid: scan.lastUid, checkedAt: now.toISOString(), error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Gmail inbox could not be checked.";
    console.error("Checking Gmail failed", error);
    await saveGmailState({ ...state, checkedAt: now.toISOString(), error: message });
    return { ok: false, added: 0, error: message, checked: true };
  }
  await saveGmailState(next);
  return { ok: true, added, checked: true };
}

/** For page loads: checks Gmail in the background, never throws. */
export async function checkGmailRepliesQuietly(): Promise<void> {
  try {
    await checkGmailReplies(false);
  } catch (error) {
    console.error("Background Gmail check failed", error);
  }
}

export async function gmailCheckState(): Promise<GmailCheckState | null> {
  return readEnv().provider === "gmail" ? readGmailState() : null;
}

// ---------- receiving: Resend webhook ----------

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
  const { apiKey, webhookSecret } = env.resend;
  if (!apiKey || !webhookSecret) return 503;
  const header = (name: string) => headers.get(`svix-${name}`) ?? headers.get(`webhook-${name}`) ?? "";
  const resend = new Resend(apiKey);
  let event;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: { id: header("id"), timestamp: header("timestamp"), signature: header("signature") },
      webhookSecret,
    });
  } catch {
    return 401;
  }

  try {
    if (event.type === "email.received") {
      const data = event.data;
      const { data: full, error } = await resend.emails.receiving.get(data.email_id);
      if (error || !full) throw new Error(`Could not fetch received email: ${error?.message ?? "no data"}`);
      const from = full.from || data.from;
      await recordReceivedEmail(
        env,
        {
          id: data.email_id,
          at: data.created_at || full.created_at || new Date().toISOString(),
          from,
          fromName: displayNameOf(from),
          recipients: [...(data.received_for ?? []), ...data.to],
          subject: full.subject || data.subject || "",
          text: full.text?.trim() ? full.text : full.html ? htmlToText(full.html) : "",
          messageId: full.message_id || data.message_id || null,
        },
        { keepUnmatched: true, senderMustMatch: false },
      );
      return 200;
    }
    const delivery = DELIVERY_EVENTS[event.type];
    if (delivery && "email_id" in event.data) {
      const data = event.data as { email_id: string; message_id?: string; tags?: Record<string, string> };
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
