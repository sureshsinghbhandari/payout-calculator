/**
 * Audit log: who did what, and when. Shared types and pure helpers.
 */
import type { AdminRole, AdminUser, Investor } from "./accounts";
import { addDays, addMonths, isValidIsoDate } from "./dates";

export type AuditActorKind = "admin" | "investor" | "visitor" | "system";

export interface AuditActor {
  kind: AuditActorKind;
  id?: string;
  name: string;
  username?: string;
  role?: AdminRole;
}

/** "email" is emails sent by the app or staff; "customer" is emails received from customers. */
export type AuditCategory = "sign-in" | "inquiry" | "investor" | "user" | "rates" | "products" | "email" | "customer";

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  "sign-in": "Sign-in and passwords",
  inquiry: "Inquiries",
  investor: "Investors",
  user: "Employees",
  rates: "Earnings rates",
  products: "Amounts and terms",
  email: "Emails sent",
  customer: "Customer responses",
};

export interface AuditTarget {
  type: "inquiry" | "investor" | "user" | "rates" | "products";
  id?: string;
  label: string;
}

export interface AuditEvent {
  id: string;
  /** ISO timestamp (UTC). */
  at: string;
  actor: AuditActor;
  category: AuditCategory;
  /** Machine-readable action, e.g. "inquiry.status". */
  action: string;
  /** Human-readable sentence, e.g. "Marked inquiry A1B2C3D4 (Jane Doe) as contacted". */
  summary: string;
  target?: AuditTarget;
  /**
   * Successful admin sign-ins only: a short keyed hash of the network (IP
   * address with the last part dropped) and browser the person signed in
   * from. The address itself is never stored. Used to spot sign-ins from a
   * new device or network.
   */
  client?: string;
}

export type NewAuditEvent = Omit<AuditEvent, "id" | "at">;

/** Keeps the well-formed events of a stored list. */
export function parseAuditEvents(list: unknown): AuditEvent[] {
  if (!Array.isArray(list)) return [];
  return list.filter(
    (e): e is AuditEvent =>
      typeof e === "object" &&
      e !== null &&
      typeof (e as AuditEvent).id === "string" &&
      typeof (e as AuditEvent).at === "string" &&
      typeof (e as AuditEvent).summary === "string" &&
      typeof (e as AuditEvent).actor?.name === "string",
  );
}

export function adminActor(user: Pick<AdminUser, "id" | "name" | "username" | "role">): AuditActor {
  return { kind: "admin", id: user.id, name: user.name, username: user.username, role: user.role };
}

export function investorActor(investor: Pick<Investor, "id" | "name" | "username">): AuditActor {
  return { kind: "investor", id: investor.id, name: investor.name, username: investor.username };
}

export const SYSTEM_ACTOR: AuditActor = { kind: "system", name: "System" };

export function visitorActor(name: string, username?: string): AuditActor {
  return { kind: "visitor", name, ...(username ? { username } : {}) };
}

/** "2026-10" for an ISO timestamp. */
export function auditMonth(iso: string): string {
  return iso.slice(0, 7);
}

export function isAuditMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** The months ("YYYY-MM") from one ISO date or timestamp to another, oldest first. */
export function auditMonthsBetween(fromIso: string, toIso: string): string[] {
  const months: string[] = [];
  let [year, month] = fromIso.slice(0, 7).split("-").map(Number);
  const last = auditMonth(toIso);
  for (;;) {
    const current = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
    if (current > last) return months;
    months.push(current);
    if (++month > 12) {
      month = 1;
      year++;
    }
  }
}

/** Longest date range the audit log export accepts. */
export const AUDIT_EXPORT_MAX_DAYS = 366;

/** First and last day (YYYY-MM-DD) of a "YYYY-MM" month. */
export function auditMonthRange(month: string): { from: string; to: string } {
  const from = `${month}-01`;
  return { from, to: addDays(addMonths(from, 1), -1) };
}

/** Validates the export range (both days included). */
export function parseAuditExportRange(
  from: unknown,
  to: unknown,
): { ok: true; from: string; to: string } | { ok: false; error: string } {
  if (typeof from !== "string" || typeof to !== "string" || !isValidIsoDate(from) || !isValidIsoDate(to)) {
    return { ok: false, error: "Choose a start and end date." };
  }
  if (from > to) return { ok: false, error: "The start date must be on or before the end date." };
  if (addDays(from, AUDIT_EXPORT_MAX_DAYS - 1) < to) {
    return { ok: false, error: `Choose a range of at most ${AUDIT_EXPORT_MAX_DAYS} days.` };
  }
  return { ok: true, from, to };
}
