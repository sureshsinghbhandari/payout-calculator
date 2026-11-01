/**
 * Privacy requests: an investor asking for a copy of their data, or for their
 * account to be deleted. There is no automated export or deletion — a Master
 * Admin handles the request manually (e.g. emails the data, or removes the
 * account using the existing investor tools), then marks it fulfilled or
 * declined here. Shared types and pure helpers, in the same spirit as
 * profile-requests.ts (contact and bank detail change requests).
 */

export type PrivacyRequestKind = "copy" | "deletion";
export type PrivacyRequestStatus = "pending" | "fulfilled" | "declined" | "withdrawn";

export const PRIVACY_KIND_LABELS: Record<PrivacyRequestKind, string> = {
  copy: "Copy of your data",
  deletion: "Delete your account",
};

export const PRIVACY_STATUS_LABELS: Record<PrivacyRequestStatus, string> = {
  pending: "Waiting for review",
  fulfilled: "Fulfilled",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

export const PRIVACY_STATUS_BADGES: Record<PrivacyRequestStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  fulfilled: "bg-emerald-100 text-emerald-800",
  declined: "bg-red-100 text-red-800",
  withdrawn: "bg-slate-100 text-slate-700",
};

export interface PrivacyRequest {
  id: string;
  kind: PrivacyRequestKind;
  status: PrivacyRequestStatus;
  requestedAt: string;
  /** What the investor added when asking, if anything. */
  note: string;
  decidedAt: string | null;
  /** Name and id of the admin who fulfilled or declined it. */
  decidedBy: string | null;
  decidedById: string | null;
  /** Reason given when fulfilling or declining; shown to the investor. */
  reason: string;
}

/** Decided requests kept per investor (pending ones are always kept). */
export const PRIVACY_HISTORY_KEEP = 20;
export const PRIVACY_NOTE_MAX = 500;
export const PRIVACY_REASON_MAX = 300;

// Control characters other than newline are never valid in these fields.
const CONTROL_CHARS = /[\u0000-\u0009\u000B-\u001F\u007F]/;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isPrivacyRequestKind(value: unknown): value is PrivacyRequestKind {
  return value === "copy" || value === "deletion";
}

/** The investor's optional note when asking for a copy or deletion. */
export function parsePrivacyNote(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const note = text(raw).replace(/\r\n/g, "\n");
  if (note.length > PRIVACY_NOTE_MAX) return { ok: false, error: `Use at most ${PRIVACY_NOTE_MAX} characters.` };
  if (CONTROL_CHARS.test(note)) return { ok: false, error: "Remove unusual characters from the note." };
  return { ok: true, value: note };
}

/** The optional reason an admin gives when fulfilling or declining a request. */
export function parsePrivacyReason(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const reason = text(raw).replace(/\s+/g, " ");
  if (reason.length > PRIVACY_REASON_MAX) return { ok: false, error: `Use at most ${PRIVACY_REASON_MAX} characters.` };
  if (CONTROL_CHARS.test(reason)) return { ok: false, error: "Enter a valid reason." };
  return { ok: true, value: reason };
}

/** Newest first. */
export function sortPrivacyRequests(requests: readonly PrivacyRequest[]): PrivacyRequest[] {
  return [...requests].sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : a.requestedAt > b.requestedAt ? -1 : 0));
}

/** Total pending privacy requests across investors, for a badge next to the admin link. */
export function pendingPrivacyCount(investors: readonly { privacyRequests: readonly PrivacyRequest[] }[]): number {
  return investors.reduce((sum, i) => sum + i.privacyRequests.filter((r) => r.status === "pending").length, 0);
}
