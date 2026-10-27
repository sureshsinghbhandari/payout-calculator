/**
 * Audit log: who did what, and when. Shared types and pure helpers.
 */
import type { AdminRole, AdminUser, Investor } from "./accounts";

export type AuditActorKind = "admin" | "investor" | "visitor" | "system";

export interface AuditActor {
  kind: AuditActorKind;
  id?: string;
  name: string;
  username?: string;
  role?: AdminRole;
}

/**
 * "customer" is reserved for customer email responses (coming with the Gmail
 * integration).
 */
export type AuditCategory = "sign-in" | "inquiry" | "investor" | "user" | "rates" | "customer";

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  "sign-in": "Sign-in and passwords",
  inquiry: "Inquiries",
  investor: "Investors",
  user: "Users",
  rates: "Interest rates",
  customer: "Customer responses",
};

export interface AuditTarget {
  type: "inquiry" | "investor" | "user" | "rates";
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
}

export type NewAuditEvent = Omit<AuditEvent, "id" | "at">;

export function adminActor(user: Pick<AdminUser, "id" | "name" | "username" | "role">): AuditActor {
  return { kind: "admin", id: user.id, name: user.name, username: user.username, role: user.role };
}

export function investorActor(investor: Pick<Investor, "id" | "name" | "username">): AuditActor {
  return { kind: "investor", id: investor.id, name: investor.name, username: investor.username };
}

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
