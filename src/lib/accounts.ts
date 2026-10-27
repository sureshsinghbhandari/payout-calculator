/**
 * Admin users, roles and investors: shared types and pure helpers.
 * Secrets (password hashes, setup token hashes) never leave the server:
 * pass `toPublicAdmin` / `toPublicInvestor` results to client components.
 */
import type { PayoutFrequency, PayoutType } from "./payout";

export type AdminRole = "master" | "sales";

export const ROLE_LABELS: Record<AdminRole, string> = {
  master: "Master Admin",
  sales: "Sales Admin",
};

export type Permission =
  | "inquiries.view"
  | "inquiries.status"
  | "inquiries.delete"
  | "inquiries.convert"
  | "inquiries.email"
  | "inquiries.notes"
  | "inquiries.assign"
  | "inquiries.export"
  | "investors.manage"
  | "sources.manage"
  | "rates.manage"
  | "users.manage"
  | "email.manage"
  | "audit.view"
  | "roadmap.view"
  // TEMPORARY: permanent deletion of inquiries, to be removed before go-live.
  | "inquiries.purge";

const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  master: [
    "inquiries.view",
    "inquiries.status",
    "inquiries.delete",
    "inquiries.convert",
    "inquiries.email",
    "inquiries.notes",
    "inquiries.assign",
    "inquiries.export",
    "investors.manage",
    "sources.manage",
    "rates.manage",
    "users.manage",
    "email.manage",
    "audit.view",
    "roadmap.view",
    "inquiries.purge",
  ],
  // Sales admins only work with inquiries: view them, add notes, email the customer, mark them contacted,
  // assign them and set follow-up dates, and export them (without rates).
  sales: ["inquiries.view", "inquiries.status", "inquiries.email", "inquiries.notes", "inquiries.assign", "inquiries.export"],
};

export function can(role: AdminRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Password and setup-link state shared by admin users and investors. */
export interface Credentials {
  /** scrypt hash, or null until the person sets a password. */
  passwordHash: string | null;
  /** Increases on every password change; signs out older sessions. */
  passwordVersion: number;
  /** True when an admin set a temporary password: the person must choose a new one at sign-in. */
  mustChangePassword: boolean;
  /** SHA-256 of the current one-time setup token, if one is outstanding. */
  setupTokenHash: string | null;
  /** ISO timestamp when the setup token expires. */
  setupExpiresAt: string | null;
}

export interface AdminUser extends Credentials {
  id: string;
  name: string;
  username: string;
  role: AdminRole;
  active: boolean;
  createdAt: string;
}

export interface Investment {
  id: string;
  principal: number;
  investmentDate: string;
  lockInYears: number;
  frequency: PayoutFrequency;
  payoutType: PayoutType;
  /** Rate fixed when the investment was recorded. Never shown to the investor. */
  annualRatePercent: number;
  createdAt: string;
}

export interface Investor extends Credentials {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  active: boolean;
  createdAt: string;
  /** Inquiry this investor was converted from, if any. */
  sourceInquiryId: string | null;
  investments: Investment[];
}

/**
 * The users created on first use. Passwords are set by the people themselves:
 * through a setup link, or by changing a temporary password a Master Admin set.
 */
export const SEED_ADMINS: ReadonlyArray<{ id: string; name: string; username: string; role: AdminRole }> = [
  { id: "adm_apatel", name: "Ashwin Patel", username: "apatel", role: "master" },
  { id: "adm_sbhandari", name: "Suresh Bhandari", username: "sbhandari", role: "sales" },
];

/**
 * Until this Master Admin has set a personal password, they can sign in once
 * with the ADMIN_PASSWORD environment variable and are then asked to set one.
 */
export const BOOTSTRAP_MASTER_USERNAME = "apatel";

/** How long a setup link stays valid. */
export const SETUP_LINK_HOURS = 72;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** 3-32 characters: lowercase letters, digits, dot, underscore or hyphen; starts with a letter or digit. */
export function validateUsername(username: string): string | null {
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
    return "Use 3 to 32 lowercase letters, digits, dots, underscores or hyphens.";
  }
  return null;
}

export function validatePersonName(name: string): string | null {
  const clean = name.trim();
  if (clean === "") return "Enter a name.";
  if (clean.length > 100) return "Use at most 100 characters.";
  return null;
}

/** Setup-link state for display. */
export function setupState(account: Credentials, nowMs: number): "active" | "link-pending" | "link-expired" | "not-set-up" {
  if (account.passwordHash) return "active";
  if (account.setupTokenHash && account.setupExpiresAt) {
    return Date.parse(account.setupExpiresAt) > nowMs ? "link-pending" : "link-expired";
  }
  return "not-set-up";
}

export interface PublicAdmin {
  id: string;
  name: string;
  username: string;
  role: AdminRole;
  active: boolean;
  createdAt: string;
  hasPassword: boolean;
  mustChangePassword: boolean;
  setupExpiresAt: string | null;
}

export function toPublicAdmin(user: AdminUser): PublicAdmin {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
    hasPassword: Boolean(user.passwordHash),
    mustChangePassword: user.mustChangePassword,
    setupExpiresAt: user.setupTokenHash ? user.setupExpiresAt : null,
  };
}

export const INVESTOR_SEARCH_MAX = 100;

/**
 * Search investors by name, email, username (case-insensitive, part of the
 * text is enough) or phone, matched on its digits.
 */
export function matchesInvestorSearch(investor: Pick<Investor, "name" | "email" | "username" | "phone">, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  if ([investor.name, investor.email, investor.username].some((v) => v.toLowerCase().includes(q))) return true;
  const digits = q.replace(/\D/g, "");
  return digits.length >= 3 && /^[+()\-.\s\d]+$/.test(q) && investor.phone.replace(/\D/g, "").includes(digits);
}

export interface PublicInvestor {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  active: boolean;
  createdAt: string;
  sourceInquiryId: string | null;
  hasPassword: boolean;
  mustChangePassword: boolean;
  setupExpiresAt: string | null;
  investments: Investment[];
}

/** Investor data safe for admin client components (includes rates; admins may see them). */
export function toPublicInvestor(investor: Investor): PublicInvestor {
  return {
    id: investor.id,
    name: investor.name,
    username: investor.username,
    email: investor.email,
    phone: investor.phone,
    active: investor.active,
    createdAt: investor.createdAt,
    sourceInquiryId: investor.sourceInquiryId,
    hasPassword: Boolean(investor.passwordHash),
    mustChangePassword: investor.mustChangePassword,
    setupExpiresAt: investor.setupTokenHash ? investor.setupExpiresAt : null,
    investments: investor.investments.map((i) => ({ ...i })),
  };
}
