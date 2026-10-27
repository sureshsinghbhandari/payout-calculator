"use server";

import { headers } from "next/headers";
import {
  findAccountBySetupToken,
  getAdminUser,
  getInvestor,
  setAdminPassword,
  setInvestorPassword,
} from "@/lib/server/accounts-store";
import { clientKey, LoginThrottle } from "@/lib/server/login-throttle";
import { hashPassword, validateNewPassword } from "@/lib/server/passwords";
import { recordAudit } from "@/lib/server/audit-store";

/** Public action behind /setup?token=…: sets the password for the account a setup link belongs to. */

export interface SetupPasswordState {
  status: "idle" | "error" | "invalid-link" | "done";
  message?: string;
  fieldErrors?: Partial<Record<"password" | "confirm", string>>;
  /** On success: where to sign in. */
  kind?: "admin" | "investor";
  username?: string;
}

// Every submit counts, whatever the outcome: 10 per client per 15 minutes.
const setupThrottle = new LoginThrottle(10, 15 * 60 * 1000);

const INVALID_LINK =
  "This setup link is no longer valid. It may have expired or already been used. Ask an administrator for a new link.";

export async function setPasswordFromLinkAction(
  _prev: SetupPasswordState,
  formData: FormData,
): Promise<SetupPasswordState> {
  const client = clientKey(await headers());
  const now = Date.now();
  const waitMs = setupThrottle.blockedFor(client, now);
  if (waitMs > 0) {
    const minutes = Math.ceil(waitMs / 60_000);
    return { status: "error", message: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  }
  setupThrottle.recordFailure(client, now);

  const token = formData.get("token");
  const password = formData.get("password");
  const confirm = formData.get("confirm");
  if (typeof token !== "string" || typeof password !== "string" || typeof confirm !== "string") {
    return { status: "invalid-link", message: INVALID_LINK };
  }

  try {
    // Check the link again: it may have expired, been used or been replaced since the page loaded.
    const account = await findAccountBySetupToken(token, Date.now());
    if (!account) return { status: "invalid-link", message: INVALID_LINK };
    const record = account.kind === "admin" ? await getAdminUser(account.id) : await getInvestor(account.id);
    if (!record?.active) {
      return { status: "invalid-link", message: "This account is disabled. Ask an administrator for help." };
    }

    const passwordError = validateNewPassword(password, confirm);
    if (passwordError) {
      // A mismatch belongs to the confirmation field; length problems to the password itself.
      const field = validateNewPassword(password, password) === null ? "confirm" : "password";
      return { status: "error", message: passwordError, fieldErrors: { [field]: passwordError } };
    }

    // Setting the password also clears the setup link, so it cannot be used again.
    const hash = await hashPassword(password);
    if (account.kind === "admin") await setAdminPassword(account.id, hash, false);
    else await setInvestorPassword(account.id, hash, false);
    recordAudit({
      actor: { kind: account.kind, id: account.id, name: account.name, username: account.username },
      category: "sign-in",
      action: account.kind === "admin" ? "admin.setup_link_used" : "investor.setup_link_used",
      summary: "Set their password with a setup link",
    });
    return { status: "done", kind: account.kind, username: account.username };
  } catch (error) {
    console.error("Setting a password from a setup link failed", error);
    return { status: "error", message: "Your password could not be saved. Please try again." };
  }
}
