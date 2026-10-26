/**
 * Visitor inquiries: validation of the public form and the stored format.
 * Pure functions so they can be unit tested.
 */
import { parseQuoteInputs } from "./quote";
import type { QuoteInputs } from "./scenarios";
import type { PayoutFrequency, PayoutType } from "./payout";

export const INQUIRY_LIMITS = {
  name: 100,
  email: 254,
  phone: 25,
  message: 1000,
} as const;

export type InquiryField = "name" | "email" | "phone" | "message";
export type InquiryStatus = "new" | "contacted" | "converted" | "deleted";
/** Statuses an admin can set directly with Mark as new / Mark as contacted. */
export type ActiveInquiryStatus = "new" | "contacted";

export interface InquiryContact {
  name: string;
  email: string;
  phone: string;
  message: string;
}

/** Snapshot of the plan the visitor was looking at, calculated on the server. */
export interface InquiryPlan extends QuoteInputs {
  startDate: string;
  /** Rate used for the snapshot (admin-only; never shown to visitors). */
  annualRatePercent: number;
  totalInterestCents: number;
  totalPaidCents: number;
}

export interface StoredInquiry extends InquiryContact {
  id: string;
  /** ISO timestamp (UTC). */
  createdAt: string;
  status: InquiryStatus;
  /** When the inquiry was (soft) deleted, ISO timestamp (UTC). */
  deletedAt?: string;
  /** Status to return to when a deleted inquiry is restored. */
  statusBeforeDelete?: ActiveInquiryStatus;
  /** Investor created from this inquiry (status "converted"). */
  investorId?: string;
  /** When the inquiry was converted, ISO timestamp (UTC). */
  convertedAt?: string;
  plan: InquiryPlan;
}

export type InquiryParse =
  | { ok: true; contact: InquiryContact; plan: QuoteInputs; isSpam: boolean }
  | { ok: false; errors: Partial<Record<InquiryField | "plan", string>> };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^[+()\-.\s\d]+$/;
// Control characters other than newline/tab are never valid in a form field.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Validates the inquiry form. `website` is a hidden honeypot field bots tend to fill. */
export function parseInquiryForm(raw: Record<string, unknown>): InquiryParse {
  const errors: Partial<Record<InquiryField | "plan", string>> = {};
  const name = text(raw.name).replace(/\s+/g, " ");
  const email = text(raw.email).toLowerCase();
  const phone = text(raw.phone);
  const message = text(raw.message).replace(/\r\n/g, "\n");

  if (name === "") errors.name = "Enter your name.";
  else if (name.length > INQUIRY_LIMITS.name) errors.name = `Use at most ${INQUIRY_LIMITS.name} characters.`;
  else if (CONTROL_CHARS.test(name)) errors.name = "Enter a valid name.";

  if (email === "") errors.email = "Enter your email address.";
  else if (email.length > INQUIRY_LIMITS.email || !EMAIL_PATTERN.test(email)) {
    errors.email = "Enter a valid email address, like name@example.com.";
  }

  if (phone !== "") {
    const digits = phone.replace(/\D/g, "").length;
    if (phone.length > INQUIRY_LIMITS.phone || !PHONE_PATTERN.test(phone) || digits < 7 || digits > 15) {
      errors.phone = "Enter a valid phone number, or leave it empty.";
    }
  }

  if (message.length > INQUIRY_LIMITS.message) {
    errors.message = `Use at most ${INQUIRY_LIMITS.message} characters.`;
  } else if (CONTROL_CHARS.test(message)) {
    errors.message = "Remove unusual characters from the message.";
  }

  const plan = parseQuoteInputs({
    principal: Number(text(raw.principal)),
    lockInYears: Number(text(raw.lockInYears)),
    frequency: text(raw.frequency),
    payoutType: text(raw.payoutType),
    investmentDate: text(raw.investmentDate),
  });
  if (!plan.ok) errors.plan = "The plan details are missing. Calculate your payout again, then send the inquiry.";

  if (Object.keys(errors).length > 0 || !plan.ok) return { ok: false, errors };
  return {
    ok: true,
    contact: { name, email, phone, message },
    plan: plan.value,
    isSpam: text(raw.website) !== "",
  };
}

const ID_PATTERN = /^\d{8}T\d{9}Z-[0-9a-f]{8}$/;

/** Ids sort by time: "20261025T153400123Z-a1b2c3d4". */
export function makeInquiryId(createdAt: Date, randomHex: string): string {
  const stamp = createdAt.toISOString().replace(/[-:.]/g, "");
  return `${stamp}-${randomHex}`;
}

export function isInquiryId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/** Short reference shown to the visitor, e.g. "A1B2C3D4". */
export function inquiryReference(id: string): string {
  return id.slice(-8).toUpperCase();
}

const FREQUENCIES: PayoutFrequency[] = ["quarterly", "half-yearly", "yearly"];
const TYPES: PayoutType[] = ["interest-only", "interest-and-principal"];

/** Parses a stored inquiry file. Throws if it is not a valid inquiry. */
export function parseStoredInquiry(textValue: string): StoredInquiry {
  const d = JSON.parse(textValue) as Record<string, unknown>;
  const plan = (d.plan ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const id = str(d.id);
  const createdAt = str(d.createdAt);
  const name = str(d.name);
  const email = str(d.email);
  if (!id || !isInquiryId(id) || !createdAt || !name || !email) throw new Error("Invalid inquiry.");
  const frequency = str(plan.frequency) as PayoutFrequency | null;
  const payoutType = str(plan.payoutType) as PayoutType | null;
  const values = {
    principal: num(plan.principal),
    lockInYears: num(plan.lockInYears),
    annualRatePercent: num(plan.annualRatePercent),
    totalInterestCents: num(plan.totalInterestCents),
    totalPaidCents: num(plan.totalPaidCents),
    investmentDate: str(plan.investmentDate),
    startDate: str(plan.startDate),
  };
  if (
    !frequency ||
    !FREQUENCIES.includes(frequency) ||
    !payoutType ||
    !TYPES.includes(payoutType) ||
    Object.values(values).some((v) => v === null)
  ) {
    throw new Error("Invalid inquiry plan.");
  }
  const status: InquiryStatus =
    d.status === "contacted" || d.status === "deleted" || d.status === "converted" ? d.status : "new";
  const deletedAt = str(d.deletedAt);
  const statusBeforeDelete = d.statusBeforeDelete === "contacted" ? "contacted" : "new";
  return {
    id,
    createdAt,
    status,
    ...(status === "deleted" ? { deletedAt: deletedAt ?? createdAt, statusBeforeDelete } : {}),
    ...(status === "converted" ? { investorId: str(d.investorId) ?? undefined, convertedAt: str(d.convertedAt) ?? undefined } : {}),
    name,
    email,
    phone: str(d.phone) ?? "",
    message: str(d.message) ?? "",
    plan: {
      principal: values.principal!,
      lockInYears: values.lockInYears!,
      frequency,
      payoutType,
      investmentDate: values.investmentDate!,
      startDate: values.startDate!,
      annualRatePercent: values.annualRatePercent!,
      totalInterestCents: values.totalInterestCents!,
      totalPaidCents: values.totalPaidCents!,
    },
  };
}
