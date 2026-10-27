/**
 * Changes investors ask for from the portal (contact details and bank
 * details), which a Master Admin approves or rejects. Shared types and pure
 * helpers: form validation (used by the server actions; nothing from the
 * browser is trusted) and display helpers.
 *
 * Bank details are stored encrypted (see server/bank-crypto.ts). Only the last
 * 4 characters of the account number are kept in plain text, for display.
 */
import { normalizeEmail, validateEmailAddress, validatePhoneNumber } from "./accounts";

export type ChangeRequestKind = "contact" | "bank";
export type ChangeRequestStatus = "pending" | "approved" | "rejected" | "withdrawn";

export const CHANGE_KIND_LABELS: Record<ChangeRequestKind, string> = {
  contact: "Contact details",
  bank: "Bank details",
};

export const CHANGE_STATUS_LABELS: Record<ChangeRequestStatus, string> = {
  pending: "Waiting for review",
  approved: "Approved",
  rejected: "Not approved",
  withdrawn: "Withdrawn",
};

export const CHANGE_STATUS_BADGES: Record<ChangeRequestStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  withdrawn: "bg-slate-100 text-slate-700",
};

/** Bank details as the investor typed them (never stored like this). */
export interface BankDetails {
  accountHolder: string;
  bankName: string;
  /** Routing number, sort code or similar branch code. */
  routingCode: string;
  accountNumber: string;
}

/** Bank details on the investor, encrypted at rest. */
export interface StoredBankDetails {
  /** AES-256-GCM: "v1.<iv>.<tag>.<ciphertext>" (base64url) of the JSON bank details. */
  encrypted: string;
  accountLast4: string;
  updatedAt: string;
}

export interface ChangeRequest {
  id: string;
  kind: ChangeRequestKind;
  status: ChangeRequestStatus;
  requestedAt: string;
  /** Contact requests: the new email address and phone number. */
  contact: { email: string; phone: string } | null;
  /**
   * Bank requests: the new details, encrypted. `encrypted` is removed once the
   * request is decided or withdrawn (an approved change moves to the investor).
   */
  bank: { encrypted: string | null; accountLast4: string } | null;
  decidedAt: string | null;
  /** Name and id of the admin who approved or rejected it. */
  decidedBy: string | null;
  decidedById: string | null;
  /** Optional reason given when approving or rejecting. */
  reason: string;
}

/** Decided requests kept per investor (pending ones are always kept). */
export const CHANGE_HISTORY_KEEP = 20;
export const REASON_MAX = 300;

// Control characters are never valid in these single-line fields.
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export type ContactChangeField = "email" | "phone";
export type BankField = keyof BankDetails;

export function parseContactChange(
  raw: Partial<Record<ContactChangeField, unknown>>,
): { ok: true; value: { email: string; phone: string } } | { ok: false; errors: Partial<Record<ContactChangeField, string>> } {
  const errors: Partial<Record<ContactChangeField, string>> = {};
  const email = normalizeEmail(text(raw.email));
  const phone = text(raw.phone).replace(/\s+/g, " ");
  const emailError = validateEmailAddress(email);
  if (emailError) errors.email = emailError;
  else if (CONTROL_CHARS.test(email)) errors.email = "Enter a valid email address, like name@example.com.";
  const phoneError = validatePhoneNumber(phone);
  if (phoneError) errors.phone = phoneError;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { email, phone } };
}

/** Letters and digits only, upper case (spaces and hyphens are dropped). */
function compactCode(raw: string): string {
  return raw.replace(/[\s-]+/g, "").toUpperCase();
}

export function parseBankDetails(
  raw: Partial<Record<BankField, unknown>>,
): { ok: true; value: BankDetails } | { ok: false; errors: Partial<Record<BankField, string>> } {
  const errors: Partial<Record<BankField, string>> = {};
  const accountHolder = text(raw.accountHolder).replace(/\s+/g, " ");
  const bankName = text(raw.bankName).replace(/\s+/g, " ");
  const routingCode = compactCode(text(raw.routingCode));
  const accountNumber = compactCode(text(raw.accountNumber));

  if (accountHolder.length < 2) errors.accountHolder = "Enter the name on the account.";
  else if (accountHolder.length > 100 || CONTROL_CHARS.test(accountHolder)) {
    errors.accountHolder = "Use at most 100 characters.";
  }
  if (bankName.length < 2) errors.bankName = "Enter the name of the bank.";
  else if (bankName.length > 100 || CONTROL_CHARS.test(bankName)) errors.bankName = "Use at most 100 characters.";
  if (!/^[A-Z0-9]{4,15}$/.test(routingCode)) {
    errors.routingCode = "Enter the routing number or sort code: 4 to 15 letters or digits.";
  }
  if (!/^[A-Z0-9]{4,34}$/.test(accountNumber) || !/\d/.test(accountNumber)) {
    errors.accountNumber = "Enter the account number: 4 to 34 letters or digits.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { accountHolder, bankName, routingCode, accountNumber } };
}

export function accountLast4(accountNumber: string): string {
  return accountNumber.slice(-4);
}

/** "•••• 1234" */
export function maskedAccountNumber(last4: string): string {
  return `•••• ${last4}`;
}

/** The optional reason an admin gives when deciding a request. */
export function parseReason(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const reason = text(raw).replace(/\s+/g, " ");
  if (reason.length > REASON_MAX) return { ok: false, error: `Use at most ${REASON_MAX} characters.` };
  if (CONTROL_CHARS.test(reason)) return { ok: false, error: "Enter a valid reason." };
  return { ok: true, value: reason };
}

/** Newest first. */
export function sortRequests(requests: readonly ChangeRequest[]): ChangeRequest[] {
  return [...requests].sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : a.requestedAt > b.requestedAt ? -1 : 0));
}

/** Bank details safe to show: everything except the full account number. */
export interface MaskedBankDetails {
  accountHolder: string;
  bankName: string;
  routingCode: string;
  accountLast4: string;
}

/** A change request prepared for display (built on the server; no full account number). */
export interface ChangeRequestView {
  id: string;
  kind: ChangeRequestKind;
  status: ChangeRequestStatus;
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  reason: string;
  contact: { email: string; phone: string } | null;
  /** Pending bank requests: the new details, masked. Null once decided, or when they cannot be read. */
  bank: MaskedBankDetails | null;
  /** Bank requests: last 4 characters of the new account number. */
  bankLast4: string | null;
}

/** An investor's current bank details prepared for display. */
export type BankDetailsView =
  | { state: "none" }
  | { state: "unreadable"; accountLast4: string; updatedAt: string }
  | { state: "ok"; details: MaskedBankDetails; updatedAt: string };

export function maskBankDetails(details: BankDetails): MaskedBankDetails {
  return {
    accountHolder: details.accountHolder,
    bankName: details.bankName,
    routingCode: details.routingCode,
    accountLast4: accountLast4(details.accountNumber),
  };
}
