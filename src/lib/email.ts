/**
 * Inquiry emails: the stored thread format, the wording of outgoing emails and
 * helpers for reading incoming ones. Pure functions so they can be unit tested.
 */
import { formatDollars, formatYears } from "./format";
import { inquiryReference, type StoredInquiry } from "./inquiry";
import { FREQUENCY_LABELS, PAYOUT_TYPE_LABELS } from "./payout";

export type EmailDirection = "out" | "in";
/** acknowledgement: automatic thank-you; reply: written by staff; customer: received from the customer. */
export type EmailKind = "acknowledgement" | "reply" | "customer";
export type EmailDelivery = "sent" | "delivered" | "bounced" | "failed" | "complained";

export interface EmailMessage {
  /** Resend email id (of the sent or the received email). */
  id: string;
  direction: EmailDirection;
  kind: EmailKind;
  /** ISO timestamp (UTC). */
  at: string;
  from: string;
  to: string;
  subject: string;
  /** Plain text body (incoming HTML is converted; never rendered as HTML). */
  text: string;
  /** RFC 5322 Message-ID, used to thread staff replies. */
  messageId?: string;
  /** Admin who wrote a staff reply. */
  sentBy?: { id: string; name: string };
  /** Delivery state of a sent email, from Resend webhooks. */
  delivery?: EmailDelivery;
  deliveryNote?: string;
}

export interface EmailThread {
  inquiryId: string;
  messages: EmailMessage[];
}

/** An incoming email that could not be matched to an inquiry. */
export interface UnmatchedEmail {
  id: string;
  at: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}

export const EMAIL_LIMITS = {
  /** Longest stored body. Longer emails are cut (the full email stays in Resend for 30 days). */
  storedText: 20_000,
  /** Longest staff reply. */
  reply: 5_000,
  /** Unmatched emails kept for review. */
  unmatched: 100,
} as const;

export const EMAIL_DELIVERY_LABELS: Record<EmailDelivery, string> = {
  sent: "Sent",
  delivered: "Delivered",
  bounced: "Bounced",
  failed: "Failed",
  complained: "Marked as spam",
};

// ---------- addresses ----------

/** "Jane Doe <jane@example.com>" → "jane@example.com" (lower case). */
export function addressOf(value: string): string {
  const match = /<([^<>\s]+@[^<>\s]+)>/.exec(value);
  return (match ? match[1] : value).trim().toLowerCase();
}

/** "Jane Doe <jane@example.com>" → "Jane Doe"; empty when there is no display name. */
export function displayNameOf(value: string): string {
  const match = /^\s*"?([^"<]*?)"?\s*<[^<>]+>\s*$/.exec(value);
  return match ? match[1].trim() : "";
}

// ---------- subjects ----------

export function acknowledgementSubject(inquiryId: string): string {
  return `We received your inquiry (Ref ${inquiryReference(inquiryId)})`;
}

export function replySubject(inquiryId: string): string {
  return `Re: Your inquiry (Ref ${inquiryReference(inquiryId)})`;
}

/** The 8-character reference in a subject such as "Re: Your inquiry (Ref A1B2C3D4)", or null. */
export function referenceFromSubject(subject: string): string | null {
  const match = /\bRef[:\s#]*([0-9A-F]{8})\b/i.exec(subject);
  return match ? match[1].toUpperCase() : null;
}

// ---------- outgoing wording ----------

export function acknowledgementText(inquiry: StoredInquiry, teamName: string): string {
  const { plan } = inquiry;
  const firstName = inquiry.name.split(" ")[0] || inquiry.name;
  return [
    `Hello ${firstName},`,
    "",
    "Thank you for your inquiry. We have received it and a member of our team will contact you soon.",
    "",
    `Your reference number is ${inquiryReference(inquiry.id)}. Please quote it if you contact us.`,
    "",
    "What you asked about:",
    `- Investment amount: ${formatDollars(plan.principal)}`,
    `- Term locked: ${formatYears(plan.lockInYears)}`,
    `- Payout term: ${FREQUENCY_LABELS[plan.frequency]}`,
    `- Payout type: ${PAYOUT_TYPE_LABELS[plan.payoutType]}`,
    "",
    "If you would like to add anything, just reply to this email.",
    "",
    "The figures shown in the calculator are estimates for illustration only. They are not an offer or a guarantee of returns.",
    "",
    "Kind regards,",
    teamName,
  ].join("\n");
}

// ---------- incoming text ----------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Rough HTML to plain text, for emails that have no text part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
      if (code[0] === "#") {
        const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
      }
      return ENTITIES[code.toLowerCase()] ?? whole;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The new part of a reply: drops the quoted earlier email ("On ... wrote:",
 * "-----Original Message-----", Outlook's "From: ... Sent: ..." block, or
 * trailing "> " lines). Returns the whole text if nothing is recognised.
 */
export function newPartOfReply(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let cut = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const next = (lines[i + 1] ?? "").trim();
    if (
      /^On .+wrote:$/i.test(line) ||
      (/^On .+/i.test(line) && /wrote:$/i.test(next)) ||
      /^-{2,}\s*Original Message\s*-{2,}$/i.test(line) ||
      (/^From:\s/i.test(line) && /^(Sent|Date):\s/i.test(next)) ||
      /^_{10,}$/.test(line)
    ) {
      cut = i;
      break;
    }
  }
  let end = cut;
  while (end > 0 && (lines[end - 1].trim() === "" || lines[end - 1].trimStart().startsWith(">"))) end--;
  const result = lines.slice(0, end).join("\n").trim();
  return result === "" ? text.trim() : result;
}

/** Normalises and shortens a body for storage. */
export function storableText(text: string): string {
  const clean = text.replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return clean.length > EMAIL_LIMITS.storedText ? `${clean.slice(0, EMAIL_LIMITS.storedText)}\n\n[Cut: the email was longer]` : clean;
}

// ---------- outgoing HTML ----------

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain text to simple HTML paragraphs. */
export function textToHtml(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">${paragraphs}</div>`;
}

// ---------- stored files ----------

function isMessage(value: unknown): value is EmailMessage {
  const m = value as EmailMessage;
  return (
    typeof m === "object" &&
    m !== null &&
    typeof m.id === "string" &&
    (m.direction === "in" || m.direction === "out") &&
    (m.kind === "acknowledgement" || m.kind === "reply" || m.kind === "customer") &&
    typeof m.at === "string" &&
    typeof m.from === "string" &&
    typeof m.to === "string" &&
    typeof m.subject === "string" &&
    typeof m.text === "string"
  );
}

export function parseThread(inquiryId: string, data: unknown): EmailThread {
  const list = (data as { messages?: unknown })?.messages;
  return { inquiryId, messages: Array.isArray(list) ? list.filter(isMessage) : [] };
}

export function parseUnmatched(data: unknown): UnmatchedEmail[] {
  const list = (data as { emails?: unknown })?.emails;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (e): e is UnmatchedEmail =>
      typeof e === "object" &&
      e !== null &&
      typeof (e as UnmatchedEmail).id === "string" &&
      typeof (e as UnmatchedEmail).at === "string" &&
      typeof (e as UnmatchedEmail).from === "string" &&
      typeof (e as UnmatchedEmail).subject === "string" &&
      typeof (e as UnmatchedEmail).text === "string",
  );
}
