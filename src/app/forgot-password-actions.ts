"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { normalizeEmail, normalizeUsername } from "@/lib/accounts";
import { visitorActor, type AuditTarget } from "@/lib/audit";
import {
  findAdminByEmail,
  findAdminByUsername,
  findInvestorByUsername,
  findInvestorsByEmail,
  isAccountStorageConfigured,
  issueAdminSetupToken,
  issueInvestorSetupToken,
} from "@/lib/server/accounts-store";
import { recordAudit } from "@/lib/server/audit-store";
import { authConfig } from "@/lib/server/auth";
import { isEmailEnabled, sendPasswordResetEmail } from "@/lib/server/email";
import { clientKey, LoginThrottle } from "@/lib/server/login-throttle";
import { siteOrigin } from "@/lib/server/site-url";

/**
 * Forgot password, for admins (/admin/forgot-password) and investors
 * (/portal/forgot-password). The answer is always the same, whether or not an
 * account matches, so the page never reveals who has an account. The lookup,
 * the new setup link (one-time, hashed, expires after SETUP_LINK_HOURS) and
 * the email all happen after the response, so timing gives nothing away either.
 * Every request is in the audit log.
 */

export type ResetKind = "admin" | "investor";

export interface ResetRequestState {
  status: "idle" | "sent" | "error";
  message?: string;
  fieldError?: string;
  /** What was typed, kept after an error. */
  identifier?: string;
}

// Every request counts: 5 per client per 15 minutes.
const clientThrottle = new LoginThrottle(5, 15 * 60 * 1000);
// At most 3 reset emails per account per hour; further requests are ignored without telling the requester.
const accountThrottle = new LoginThrottle(3, 60 * 60 * 1000);
/** Investors can share an email address; never send more than this many links for one request. */
const MAX_LINKS_PER_REQUEST = 3;

const UNAVAILABLE: Record<ResetKind, string> = {
  admin: "Password reset by email is not available yet. Ask a Master Admin to set a temporary password or send you a setup link.",
  investor: "Password reset by email is not available yet. Contact our team, who can send you a link to set a new password.",
};

export async function requestPasswordResetAction(_prev: ResetRequestState, formData: FormData): Promise<ResetRequestState> {
  const rawKind = formData.get("kind");
  const kind: ResetKind | null = rawKind === "admin" || rawKind === "investor" ? rawKind : null;
  if (!kind) return { status: "error", message: "Something went wrong. Reload the page and try again." };

  const rawIdentifier = formData.get("identifier");
  const typed = typeof rawIdentifier === "string" ? rawIdentifier.slice(0, 300) : "";
  const identifier = typed.trim().toLowerCase();
  if (identifier === "") return { status: "error", fieldError: "Enter your username or email address.", identifier: typed };
  if (identifier.length > 254 || /\s/.test(identifier)) {
    return { status: "error", fieldError: "Enter a valid username or email address.", identifier: typed };
  }

  if (!authConfig().ok || !isAccountStorageConfigured() || !isEmailEnabled()) {
    return { status: "error", message: UNAVAILABLE[kind], identifier: typed };
  }

  const requestHeaders = await headers();
  const client = clientKey(requestHeaders);
  const now = Date.now();
  const waitMs = clientThrottle.blockedFor(client, now);
  if (waitMs > 0) {
    const minutes = Math.ceil(waitMs / 60_000);
    return {
      status: "error",
      message: `Too many requests. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      identifier: typed,
    };
  }
  clientThrottle.recordFailure(client, now);

  const origin = siteOrigin(requestHeaders);
  after(() => handleResetRequest(kind, identifier, origin));
  return { status: "sent" };
}

// ---------- after the response ----------

interface ResetAccount {
  id: string;
  name: string;
  username: string;
  email: string | null;
  active: boolean;
}

async function findAccounts(kind: ResetKind, identifier: string): Promise<ResetAccount[]> {
  const byEmail = identifier.includes("@");
  if (kind === "admin") {
    const admin = byEmail ? await findAdminByEmail(normalizeEmail(identifier)) : await findAdminByUsername(normalizeUsername(identifier));
    return admin ? [admin] : [];
  }
  if (byEmail) return findInvestorsByEmail(normalizeEmail(identifier));
  const investor = await findInvestorByUsername(normalizeUsername(identifier));
  return investor ? [{ ...investor, email: investor.email.trim() || null }] : [];
}

async function handleResetRequest(kind: ResetKind, identifier: string, origin: string): Promise<void> {
  const actor = visitorActor("Unknown visitor", identifier.slice(0, 64));
  try {
    const accounts = await findAccounts(kind, identifier);
    if (accounts.length === 0) {
      recordAudit({
        actor,
        category: "sign-in",
        action: `${kind}.password_reset_unknown`,
        summary: `Password reset requested for "${identifier.slice(0, 64)}", which matches no ${kind} account (nothing sent)`,
      });
      return;
    }

    for (const account of accounts.slice(0, MAX_LINKS_PER_REQUEST)) {
      const target: AuditTarget = { type: kind === "admin" ? "user" : "investor", id: account.id, label: `${account.name} (${account.username})` };
      const skipped = (reason: string) =>
        recordAudit({
          actor,
          category: "sign-in",
          action: `${kind}.password_reset_skipped`,
          summary: `Password reset requested for ${account.name} (${account.username}); nothing sent because ${reason}`,
          target,
        });

      if (!account.active) {
        skipped("the account is disabled");
        continue;
      }
      if (!account.email) {
        skipped("the account has no email address");
        continue;
      }
      const key = `${kind}:${account.id}`;
      if (accountThrottle.blockedFor(key, Date.now()) > 0) {
        skipped("there were too many requests in the last hour");
        continue;
      }
      accountThrottle.recordFailure(key, Date.now());

      // A new setup link replaces any earlier one; the current password keeps working until it is used.
      const token = kind === "admin" ? await issueAdminSetupToken(account.id) : await issueInvestorSetupToken(account.id);
      const result = await sendPasswordResetEmail({
        to: account.email,
        name: account.name,
        username: account.username,
        link: `${origin}/setup?token=${encodeURIComponent(token)}`,
      });
      recordAudit({
        actor,
        category: "sign-in",
        action: result.ok ? `${kind}.password_reset_sent` : `${kind}.password_reset_failed`,
        summary: result.ok
          ? `Emailed a password reset link to ${account.name} (${account.username}) at ${account.email}`
          : `Could not email a password reset link to ${account.name} (${account.username}) at ${account.email}: ${result.error}`,
        target,
      });
    }
  } catch (error) {
    console.error("Handling a password reset request failed", error);
    recordAudit({
      actor,
      category: "sign-in",
      action: `${kind}.password_reset_failed`,
      summary: `A password reset request for "${identifier.slice(0, 64)}" could not be handled`,
    });
  }
}
