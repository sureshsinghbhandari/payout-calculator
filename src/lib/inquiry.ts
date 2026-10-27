/**
 * Visitor inquiries: validation of the public form and the stored format.
 * Pure functions so they can be unit tested.
 */
import { isValidIsoDate } from "./dates";
import type { ProductSettings } from "./products";
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
  /** Summary of the email thread (the messages are stored separately). */
  emails?: InquiryEmailSummary;
  /** Summary of the notes (stored in the inquiry's log). */
  notes?: InquiryNotesSummary;
  /** Where the visitor came from, e.g. "website" or "seminar-2026-11" (from ?source= on the calculator link). */
  source: string;
  /** Admin user who follows the inquiry up (name as it was when assigned). */
  assignedTo?: InquiryAssignee;
  /** When to follow up next, YYYY-MM-DD. */
  followUpDate?: string;
}

export interface InquiryAssignee {
  id: string;
  name: string;
}

/** Source of inquiries sent without a ?source= on the link. */
export const DEFAULT_LEAD_SOURCE = "website";
export const LEAD_SOURCE_MAX = 40;
const LEAD_SOURCE_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** A lead source is a short lowercase name: letters, digits and hyphens, at most 40 characters. */
export function isLeadSource(value: string): boolean {
  return value.length <= LEAD_SOURCE_MAX && LEAD_SOURCE_PATTERN.test(value);
}

/** The lead source in a form field or link, lowercased; anything invalid counts as the website. */
export function parseLeadSource(value: unknown): string {
  const source = typeof value === "string" ? value.trim().toLowerCase() : "";
  return isLeadSource(source) ? source : DEFAULT_LEAD_SOURCE;
}

/** The lead source of a calculator link: ?source=, or ?utm_source= from ad and email tools. */
export function leadSourceFromSearch(search: string): string {
  const params = new URLSearchParams(search);
  return parseLeadSource(params.get("source") || params.get("utm_source"));
}

/** Follow-up dates are calendar dates within a sensible range. */
export function isFollowUpDate(value: string): boolean {
  return isValidIsoDate(value) && value >= "2000-01-01" && value <= "2100-12-31";
}

/** Today as YYYY-MM-DD in UTC, the time zone the admin pages show times in. */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export type FollowUpState = "overdue" | "today" | "upcoming" | "closed";

/** How a follow-up date stands today; "closed" when the inquiry is no longer open. Null without a date. */
export function followUpState(inquiry: StoredInquiry, today: string): FollowUpState | null {
  if (!inquiry.followUpDate) return null;
  if (inquiry.status !== "new" && inquiry.status !== "contacted") return "closed";
  if (inquiry.followUpDate < today) return "overdue";
  return inquiry.followUpDate === today ? "today" : "upcoming";
}

/** An open inquiry whose follow-up date is today or earlier. */
export function isFollowUpDue(inquiry: StoredInquiry, today: string): boolean {
  const state = followUpState(inquiry, today);
  return state === "overdue" || state === "today";
}

export interface InquiryNotesSummary {
  count: number;
  /** The latest note, call or meeting, shortened. */
  last: { at: string; kind: "note" | "call" | "meeting"; by: string; text: string };
}

/** Length of the latest note kept on the inquiry for the list. */
export const NOTE_PREVIEW_LENGTH = 200;

export interface InquiryEmailSummary {
  /** Emails sent and received. */
  count: number;
  /** ISO timestamp (UTC) of the latest email. */
  lastAt: string;
  /** "in" when the customer wrote last, so a reply is due. */
  lastDirection: "in" | "out";
}

export type InquiryParse =
  | { ok: true; contact: InquiryContact; plan: QuoteInputs; source: string; isSpam: boolean }
  | { ok: false; errors: Partial<Record<InquiryField | "plan", string>> };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^[+()\-.\s\d]+$/;
// Control characters other than newline/tab are never valid in a form field.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Validates the inquiry form. `website` is a hidden honeypot field bots tend to fill.
 * The plan must use amounts and terms on offer (`products`; the config.ts defaults when omitted).
 */
export function parseInquiryForm(raw: Record<string, unknown>, products?: ProductSettings): InquiryParse {
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
  }, products);
  if (!plan.ok) {
    errors.plan = "The plan details are missing or no longer offered. Calculate your payout again, then send the inquiry.";
  }

  if (Object.keys(errors).length > 0 || !plan.ok) return { ok: false, errors };
  return {
    ok: true,
    contact: { name, email, phone, message },
    plan: plan.value,
    source: parseLeadSource(raw.source),
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
  const emailData = (d.emails ?? null) as Record<string, unknown> | null;
  const emailCount = num(emailData?.count);
  const emailLastAt = str(emailData?.lastAt);
  const emails: InquiryEmailSummary | undefined =
    emailCount !== null && emailLastAt
      ? { count: emailCount, lastAt: emailLastAt, lastDirection: emailData?.lastDirection === "in" ? "in" : "out" }
      : undefined;
  const noteData = (d.notes ?? null) as Record<string, unknown> | null;
  const lastNote = (noteData?.last ?? null) as Record<string, unknown> | null;
  const noteCount = num(noteData?.count);
  const notes: InquiryNotesSummary | undefined =
    noteCount !== null && str(lastNote?.at) && str(lastNote?.by) && str(lastNote?.text) !== null
      ? {
          count: noteCount,
          last: {
            at: str(lastNote?.at)!,
            kind: lastNote?.kind === "call" || lastNote?.kind === "meeting" ? lastNote.kind : "note",
            by: str(lastNote?.by)!,
            text: str(lastNote?.text)!,
          },
        }
      : undefined;
  const statusBeforeDelete = d.statusBeforeDelete === "contacted" ? "contacted" : "new";
  const assigned = (d.assignedTo ?? null) as Record<string, unknown> | null;
  const assignedId = str(assigned?.id);
  const assignedName = str(assigned?.name);
  const followUpDate = str(d.followUpDate);
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
    ...(emails ? { emails } : {}),
    ...(notes ? { notes } : {}),
    // Inquiries sent before lead sources existed came from the website.
    source: parseLeadSource(d.source),
    ...(assignedId && assignedName ? { assignedTo: { id: assignedId, name: assignedName } } : {}),
    ...(followUpDate && isFollowUpDate(followUpDate) ? { followUpDate } : {}),
  };
}

/** Filters on the Inquiries page. "open" (the default) is new and contacted, so converted ones are hidden. */
export type InquiryFilter = "open" | "new" | "contacted" | "converted" | "all";

export const INQUIRY_FILTERS: ReadonlyArray<{ value: InquiryFilter; label: string }> = [
  { value: "open", label: "Open" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "converted", label: "Converted" },
  { value: "all", label: "All" },
];

export function parseInquiryFilter(value: unknown): InquiryFilter {
  return INQUIRY_FILTERS.some((f) => f.value === value) ? (value as InquiryFilter) : "open";
}

export function matchesInquiryFilter(inquiry: StoredInquiry, filter: InquiryFilter): boolean {
  if (filter === "all") return true;
  if (filter === "open") return inquiry.status === "new" || inquiry.status === "contacted";
  return inquiry.status === filter;
}

export const INQUIRY_SEARCH_MAX = 100;

/**
 * Search by name, email or phone (case-insensitive, part of the text is
 * enough), or by reference. Phone numbers match on their digits, so
 * "555 0101" finds "+1 (555) 010-1234".
 */
export function matchesInquirySearch(inquiry: StoredInquiry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  if (inquiry.name.toLowerCase().includes(q) || inquiry.email.includes(q)) return true;
  if (inquiryReference(inquiry.id).toLowerCase() === q.replace(/^ref\s*/, "")) return true;
  const digits = q.replace(/\D/g, "");
  return digits.length >= 3 && /^[+()\-.\s\d]+$/.test(q) && inquiry.phone.replace(/\D/g, "").includes(digits);
}

/** Everything that narrows the Inquiries list, read from the URL. Empty values are not used. */
export interface InquiryListQuery {
  q: string;
  status: InquiryFilter;
  /** Only inquiries assigned to the signed-in admin. */
  mine: boolean;
  /** Only open inquiries with a follow-up date today or earlier. */
  due: boolean;
  /** Only inquiries the signed-in admin has not opened yet. */
  unread: boolean;
  source: string;
  /** Received on or after / on or before, YYYY-MM-DD (UTC). */
  from: string;
  to: string;
}

type ListParams = Record<string, string | string[] | undefined>;

function param(params: ListParams, key: string): string {
  const value = params[key];
  return ((Array.isArray(value) ? value[0] : value) ?? "").trim();
}

export function parseInquiryListQuery(params: ListParams): InquiryListQuery {
  const date = (key: string) => {
    const value = param(params, key);
    return isValidIsoDate(value) ? value : "";
  };
  let from = date("from");
  let to = date("to");
  // Dates entered the wrong way round still find what was meant.
  if (from && to && from > to) [from, to] = [to, from];
  const source = param(params, "source").toLowerCase();
  return {
    q: param(params, "q").slice(0, INQUIRY_SEARCH_MAX),
    status: parseInquiryFilter(param(params, "status")),
    mine: param(params, "mine") === "1",
    due: param(params, "due") === "1",
    unread: param(params, "unread") === "1",
    source: isLeadSource(source) ? source : "",
    from,
    to,
  };
}

/** The query string for a list link ("" when nothing narrows it); the defaults are left out. */
export function inquiryListSearch(query: InquiryListQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status !== "open") params.set("status", query.status);
  if (query.mine) params.set("mine", "1");
  if (query.due) params.set("due", "1");
  if (query.unread) params.set("unread", "1");
  if (query.source) params.set("source", query.source);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** True when anything besides the status filter narrows the list. */
export function isInquiryListNarrowed(query: InquiryListQuery): boolean {
  return Boolean(query.q || query.mine || query.due || query.unread || query.source || query.from || query.to);
}

/** Whether an inquiry is on the list for this query, for the signed-in admin on this day. */
export function matchesInquiryListQuery(
  inquiry: StoredInquiry,
  query: InquiryListQuery,
  /** `unreadIds`: the inquiries the signed-in admin has not opened (the Unread filter is skipped without it). */
  context: { userId: string; today: string; unreadIds?: ReadonlySet<string> },
): boolean {
  const received = inquiry.createdAt.slice(0, 10);
  return (
    matchesInquiryFilter(inquiry, query.status) &&
    (!query.mine || inquiry.assignedTo?.id === context.userId) &&
    (!query.due || isFollowUpDue(inquiry, context.today)) &&
    (!query.unread || !context.unreadIds || context.unreadIds.has(inquiry.id)) &&
    (!query.source || inquiry.source === query.source) &&
    (!query.from || received >= query.from) &&
    (!query.to || received <= query.to) &&
    matchesInquirySearch(inquiry, query.q)
  );
}
