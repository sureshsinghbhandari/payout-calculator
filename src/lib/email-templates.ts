/**
 * Editable email templates (Settings > Email templates): the inquiry
 * acknowledgement, the new-inquiry alert for admins and the password reset
 * email. Placeholders such as {name} are filled in when an email is sent.
 * Pure functions so they can be unit tested.
 *
 * There is deliberately no placeholder for the interest rate, and percentages
 * are refused in the acknowledgement and the alert: visitors and Sales Admins
 * never see rates.
 */
import { formatDollars, formatYears } from "./format";
import { inquiryReference, type StoredInquiry } from "./inquiry";
import { FREQUENCY_LABELS, PAYOUT_TYPE_LABELS } from "./payout";

export type TemplateKey = "acknowledgement" | "alert" | "reset";

export const TEMPLATE_KEYS: readonly TemplateKey[] = ["acknowledgement", "alert", "reset"];

export interface EmailTemplate {
  subject: string;
  body: string;
}

/** A template saved by a Master Admin. */
export interface StoredTemplate extends EmailTemplate {
  /** ISO timestamp (UTC). */
  updatedAt: string;
  updatedBy: string;
}

export type StoredTemplates = Partial<Record<TemplateKey, StoredTemplate>>;

export const TEMPLATE_LIMITS = { subject: 200, body: 5_000 } as const;

const PLACEHOLDER_HELP: Record<string, string> = {
  name: "Full name",
  firstName: "First name",
  reference: "Inquiry reference, e.g. A1B2C3D4",
  email: "Visitor's email address",
  phone: "Visitor's phone number",
  amount: "Investment amount",
  term: "Term locked, e.g. 3 years",
  payoutTerm: "Payout term, e.g. Quarterly",
  payoutType: "Payout type",
  message: "Visitor's message",
  received: "When the inquiry arrived (UTC)",
  link: "Link to open",
  username: "Username of the account",
  hours: "Hours the link stays valid",
  team: "Your team's name (the email sender name)",
};

export interface TemplateInfo {
  label: string;
  description: string;
  /** Placeholders this template can use. */
  placeholders: readonly string[];
}

export const TEMPLATE_INFO: Record<TemplateKey, TemplateInfo> = {
  acknowledgement: {
    label: "Inquiry acknowledgement",
    description: "Sent to a visitor right after they send an inquiry.",
    placeholders: ["name", "firstName", "reference", "amount", "term", "payoutTerm", "payoutType", "team"],
  },
  alert: {
    label: "New inquiry alert",
    description: "Sent to admins who switched on new inquiry alerts on My account.",
    placeholders: [
      "name",
      "firstName",
      "reference",
      "email",
      "phone",
      "amount",
      "term",
      "payoutTerm",
      "payoutType",
      "message",
      "received",
      "link",
      "team",
    ],
  },
  reset: {
    label: "Password reset",
    description: "Sent to an admin or investor who selects Forgot password. {link} opens the page to choose a new password.",
    placeholders: ["name", "firstName", "username", "link", "hours", "team"],
  },
};

export function placeholderHelp(name: string): string {
  return PLACEHOLDER_HELP[name] ?? "";
}

export const DEFAULT_TEMPLATES: Record<TemplateKey, EmailTemplate> = {
  acknowledgement: {
    subject: "We received your inquiry (Ref {reference})",
    body: [
      "Hello {firstName},",
      "",
      "Thank you for your inquiry. We have received it and a member of our team will contact you soon.",
      "",
      "Your reference number is {reference}. Please quote it if you contact us.",
      "",
      "What you asked about:",
      "- Investment amount: {amount}",
      "- Term locked: {term}",
      "- Payout term: {payoutTerm}",
      "- Payout type: {payoutType}",
      "",
      "If you would like to add anything, just reply to this email.",
      "",
      "The figures shown in the calculator are estimates for illustration only. They are not an offer or a guarantee of returns.",
      "",
      "Kind regards,",
      "{team}",
    ].join("\n"),
  },
  alert: {
    subject: "New inquiry Ref {reference} from {name}",
    body: [
      "A new inquiry has arrived.",
      "",
      "Reference: {reference}",
      "Received: {received}",
      "Name: {name}",
      "Email: {email}",
      "Phone: {phone}",
      "",
      "Investment amount: {amount}",
      "Term locked: {term}",
      "Payout term: {payoutTerm}",
      "Payout type: {payoutType}",
      "",
      "Message:",
      "{message}",
      "",
      "Open the inquiry: {link}",
      "",
      "You get this email because new inquiry alerts are on for you. To stop them, switch them off on My account in the admin area.",
    ].join("\n"),
  },
  reset: {
    subject: "Set a new password for the Investment Payout Calculator",
    body: [
      "Hello {firstName},",
      "",
      "We received a request to set a new password for your account ({username}).",
      "",
      "To choose a new password, open this link:",
      "{link}",
      "",
      "The link works once and expires after {hours} hours. Your current password keeps working until you set a new one.",
      "",
      "If you did not ask for this, you can ignore this email.",
      "",
      "Kind regards,",
      "{team}",
    ].join("\n"),
  },
};

const PLACEHOLDER = /\{([A-Za-z]+)\}/g;
// Control characters other than newline and tab are never valid.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const PERCENTAGE = /\d\s*%|\bper\s*cent\b|\bpercent\b/i;

/** Fills in placeholders. Unknown placeholders are left as they are; values are never re-scanned. */
export function renderTemplate(template: EmailTemplate, values: Record<string, string>): EmailTemplate {
  const fill = (text: string) => text.replace(PLACEHOLDER, (whole, name: string) => values[name] ?? whole);
  return {
    // A subject is always one line.
    subject: fill(template.subject).replace(/\s*[\r\n]+\s*/g, " ").trim(),
    body: fill(template.body),
  };
}

export type TemplateValidation =
  | { ok: true; value: EmailTemplate }
  | { ok: false; errors: Partial<Record<"subject" | "body", string>> };

/** Checks a template typed by a Master Admin. */
export function validateTemplate(key: TemplateKey, raw: { subject: string; body: string }): TemplateValidation {
  const subject = raw.subject.replace(/\s+/g, " ").trim();
  const body = raw.body.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  const allowed = TEMPLATE_INFO[key].placeholders;
  const errors: Partial<Record<"subject" | "body", string>> = {};

  const unknown = (text: string) =>
    [...text.matchAll(PLACEHOLDER)].map((m) => m[1]).find((name) => !allowed.includes(name));

  if (subject === "") errors.subject = "Enter a subject.";
  else if (subject.length > TEMPLATE_LIMITS.subject) errors.subject = `Use at most ${TEMPLATE_LIMITS.subject} characters.`;
  else if (CONTROL_CHARS.test(subject)) errors.subject = "Remove unusual characters.";
  else if (unknown(subject)) errors.subject = `{${unknown(subject)}} is not a placeholder this email can use.`;
  else if (key === "acknowledgement" && !subject.includes("Ref {reference}")) {
    errors.subject = "Keep “Ref {reference}” in the subject, so replies are matched to the inquiry.";
  }

  if (body === "") errors.body = "Enter the email text.";
  else if (body.length > TEMPLATE_LIMITS.body) errors.body = `Use at most ${TEMPLATE_LIMITS.body} characters.`;
  else if (CONTROL_CHARS.test(body)) errors.body = "Remove unusual characters.";
  else if (unknown(body)) errors.body = `{${unknown(body)}} is not a placeholder this email can use.`;
  else if ((key === "alert" || key === "reset") && !body.includes("{link}")) {
    errors.body = key === "reset" ? "Include {link}: it is how people set their new password." : "Include {link}, so admins can open the inquiry.";
  }

  if (key !== "reset") {
    if (!errors.subject && PERCENTAGE.test(subject)) errors.subject = "Remove the percentage: interest rates are never sent in this email.";
    if (!errors.body && PERCENTAGE.test(body)) errors.body = "Remove the percentage: interest rates are never sent in this email.";
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value: { subject, body } };
}

/** Saved templates that are still valid; anything else falls back to the default. */
export function parseStoredTemplates(data: unknown): StoredTemplates {
  const raw = (data as { templates?: unknown })?.templates;
  const result: StoredTemplates = {};
  if (typeof raw !== "object" || raw === null) return result;
  for (const key of TEMPLATE_KEYS) {
    const t = (raw as Record<string, unknown>)[key] as Record<string, unknown> | undefined;
    if (typeof t?.subject !== "string" || typeof t?.body !== "string") continue;
    const checked = validateTemplate(key, { subject: t.subject, body: t.body });
    if (!checked.ok) continue;
    result[key] = {
      ...checked.value,
      updatedAt: typeof t.updatedAt === "string" ? t.updatedAt : new Date(0).toISOString(),
      updatedBy: typeof t.updatedBy === "string" ? t.updatedBy : "",
    };
  }
  return result;
}

/** The saved template, or the default. */
export function templateFor(stored: StoredTemplates, key: TemplateKey): EmailTemplate {
  const saved = stored[key];
  return saved ? { subject: saved.subject, body: saved.body } : DEFAULT_TEMPLATES[key];
}

// ---------- values ----------

export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

const receivedFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

/** Placeholder values for an inquiry. Never includes the interest rate. */
export function inquiryTemplateValues(inquiry: StoredInquiry, team: string, link = ""): Record<string, string> {
  const { plan } = inquiry;
  return {
    name: inquiry.name,
    firstName: firstNameOf(inquiry.name),
    reference: inquiryReference(inquiry.id),
    email: inquiry.email,
    phone: inquiry.phone || "(not given)",
    amount: formatDollars(plan.principal),
    term: formatYears(plan.lockInYears),
    payoutTerm: FREQUENCY_LABELS[plan.frequency],
    payoutType: PAYOUT_TYPE_LABELS[plan.payoutType],
    message: inquiry.message.trim() || "(no message)",
    received: `${receivedFormatter.format(new Date(inquiry.createdAt))} UTC`,
    link,
    team,
  };
}

/** Example values for the preview on Settings > Email templates. */
export function sampleTemplateValues(team: string, hours: number): Record<string, string> {
  return {
    name: "Jane Doe",
    firstName: "Jane",
    reference: "A1B2C3D4",
    email: "jane.doe@example.com",
    phone: "+1 555 010 1234",
    amount: formatDollars(50_000),
    term: formatYears(3),
    payoutTerm: FREQUENCY_LABELS.quarterly,
    payoutType: PAYOUT_TYPE_LABELS["interest-only"],
    message: "Could you call me on weekday mornings?",
    received: `${receivedFormatter.format(new Date(Date.UTC(2026, 9, 27, 14, 30)))} UTC`,
    link: "https://example.com/…",
    username: "jdoe",
    hours: String(hours),
    team,
  };
}
