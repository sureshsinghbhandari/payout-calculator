import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  BOOTSTRAP_MASTER_USERNAME,
  can,
  hasTwoStep,
  normalizeUsername,
  type AccountKind,
  type AdminUser,
  type Investor,
  type Permission,
} from "../accounts";
import { findAdminByUsername, findInvestorByUsername, getAdminUser, getInvestor } from "./accounts-store";
import { hashPassword, verifyPassword } from "./passwords";
import { readAuthConfig, readToken, safeEqual, SESSION_SECONDS, signToken } from "./session";

/**
 * Authentication for admin users (Master / Sales) and investors.
 *
 * Server components: `requireAdminPage(permission?)` returns the signed-in
 * admin or redirects (to /admin to sign in, to /admin/account when a new
 * password or two-step sign-in setup is required, to /admin/inquiries when
 * the role lacks permission).
 *
 * Server actions: `requireAdminPermission(permission)` returns the admin or
 * null; always check it first, because actions are public endpoints.
 *
 * Investors: `getCurrentInvestor()`, `verifyInvestorCredentials`,
 * `startInvestorSession`, `endInvestorSession`.
 *
 * Two-step sign-in: after a correct password, an account with two-step
 * sign-in gets only a short-lived "code needed" cookie (tied to the account
 * and its password version), not a session. `startTwoStepSignIn`,
 * `getPendingTwoStepAdmin` / `getPendingTwoStepInvestor`, `endTwoStepSignIn`.
 */

const ADMIN_COOKIE = "payout_admin_session";
const ADMIN_COOKIE_PATH = "/admin";
const INVESTOR_COOKIE = "payout_investor_session";
const INVESTOR_COOKIE_PATH = "/portal";
const RATES_UNLOCK_COOKIE = "payout_rates_unlock";
const RATES_UNLOCK_PATH = "/admin/settings/rates";
export const RATES_UNLOCK_SECONDS = 10 * 60;
const TWO_STEP_COOKIE: Record<AccountKind, { name: string; path: string; tag: string }> = {
  admin: { name: "payout_admin_two_step", path: ADMIN_COOKIE_PATH, tag: "adm2" },
  investor: { name: "payout_investor_two_step", path: INVESTOR_COOKIE_PATH, tag: "inv2" },
};
/** How long the code step may take after a correct password. */
export const TWO_STEP_PENDING_SECONDS = 5 * 60;

export function authConfig() {
  return readAuthConfig(process.env);
}

function cookieOptions(path: string, maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path,
    maxAge,
  };
}

// A real hash, so failed lookups take as long as wrong passwords.
let dummyHash: Promise<string> | null = null;
async function burnTime(password: string): Promise<void> {
  dummyHash ??= hashPassword("timing-equalizer-password");
  await verifyPassword(password, await dummyHash);
}

// ---------- admin users ----------

/** Checks a username and password. Handles the one-time bootstrap password for the first Master Admin. */
export async function verifyAdminCredentials(
  usernameRaw: string,
  password: string,
): Promise<{ user: AdminUser; mustChangePassword: boolean } | null> {
  const config = authConfig();
  if (!config.ok) return null;
  const user = await findAdminByUsername(normalizeUsername(usernameRaw));
  if (!user || !user.active) {
    await burnTime(password);
    return null;
  }
  if (user.passwordHash) {
    return (await verifyPassword(password, user.passwordHash))
      ? { user, mustChangePassword: user.mustChangePassword }
      : null;
  }
  if (user.username === BOOTSTRAP_MASTER_USERNAME && user.role === "master" && config.bootstrapPassword) {
    return safeEqual(password, config.bootstrapPassword) ? { user, mustChangePassword: true } : null;
  }
  await burnTime(password);
  return null;
}

/** The signed-in admin user (active, session still valid), or null. */
export async function getCurrentAdmin(): Promise<AdminUser | null> {
  const config = authConfig();
  if (!config.ok) return null;
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  const fields = token ? readToken(token, config.secret, Date.now()) : null;
  if (!fields || fields.length !== 3 || fields[0] !== "adm") return null;
  const user = await getAdminUser(fields[1]);
  if (!user || !user.active || String(user.passwordVersion) !== fields[2]) return null;
  return user;
}

/** Whether this admin still has to replace a bootstrap or temporary password. */
export function needsNewPassword(user: AdminUser): boolean {
  return !user.passwordHash || user.mustChangePassword;
}

/** Master Admins must use two-step sign-in: true until this one has set it up. */
export function needsTwoStepSetup(user: AdminUser): boolean {
  return user.role === "master" && !hasTwoStep(user);
}

/** Whether this admin may use the admin area (no new password or two-step setup outstanding). */
export function adminAccountReady(user: AdminUser): boolean {
  return !needsNewPassword(user) && !needsTwoStepSetup(user);
}

/** For server actions: the signed-in admin if their role has `permission`, else null. */
export async function requireAdminPermission(permission: Permission): Promise<AdminUser | null> {
  const user = await getCurrentAdmin();
  if (!user || !adminAccountReady(user) || !can(user.role, permission)) return null;
  return user;
}

/** For server components: the signed-in admin, or a redirect. My account passes `allowAccountSetup`. */
export async function requireAdminPage(permission?: Permission, options?: { allowAccountSetup?: boolean }): Promise<AdminUser> {
  const user = await getCurrentAdmin();
  if (!user) redirect("/admin");
  if (!adminAccountReady(user) && !options?.allowAccountSetup) redirect("/admin/account");
  if (permission && !can(user.role, permission)) redirect("/admin/inquiries");
  return user;
}

export async function startAdminSession(user: AdminUser): Promise<void> {
  const config = authConfig();
  if (!config.ok) throw new Error("Admin access is not configured.");
  const token = signToken(config.secret, ["adm", user.id, String(user.passwordVersion)], Date.now(), SESSION_SECONDS);
  (await cookies()).set(ADMIN_COOKIE, token, cookieOptions(ADMIN_COOKIE_PATH, SESSION_SECONDS));
}

export async function endAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.delete({ name: ADMIN_COOKIE, path: ADMIN_COOKIE_PATH });
  jar.delete({ name: RATES_UNLOCK_COOKIE, path: RATES_UNLOCK_PATH });
}

// ---------- rate editing lock (per admin) ----------

export async function isRatesUnlocked(user: AdminUser): Promise<boolean> {
  const config = authConfig();
  if (!config.ok) return false;
  const token = (await cookies()).get(RATES_UNLOCK_COOKIE)?.value;
  const fields = token ? readToken(token, config.secret, Date.now()) : null;
  return Boolean(fields && fields.length === 2 && fields[0] === "rates" && fields[1] === user.id);
}

export async function unlockRates(user: AdminUser): Promise<void> {
  const config = authConfig();
  if (!config.ok) throw new Error("Admin access is not configured.");
  const token = signToken(config.secret, ["rates", user.id], Date.now(), RATES_UNLOCK_SECONDS);
  (await cookies()).set(RATES_UNLOCK_COOKIE, token, cookieOptions(RATES_UNLOCK_PATH, RATES_UNLOCK_SECONDS));
}

export async function lockRates(): Promise<void> {
  (await cookies()).delete({ name: RATES_UNLOCK_COOKIE, path: RATES_UNLOCK_PATH });
}

// ---------- investors ----------

export async function verifyInvestorCredentials(
  usernameRaw: string,
  password: string,
): Promise<{ investor: Investor; mustChangePassword: boolean } | null> {
  const config = authConfig();
  if (!config.ok) return null;
  const investor = await findInvestorByUsername(normalizeUsername(usernameRaw));
  if (!investor || !investor.active || !investor.passwordHash) {
    await burnTime(password);
    return null;
  }
  return (await verifyPassword(password, investor.passwordHash))
    ? { investor, mustChangePassword: investor.mustChangePassword }
    : null;
}

/** The signed-in investor (active, session still valid), or null. */
export async function getCurrentInvestor(): Promise<Investor | null> {
  const config = authConfig();
  if (!config.ok) return null;
  const token = (await cookies()).get(INVESTOR_COOKIE)?.value;
  const fields = token ? readToken(token, config.secret, Date.now()) : null;
  if (!fields || fields.length !== 3 || fields[0] !== "inv") return null;
  const investor = await getInvestor(fields[1]);
  if (!investor || !investor.active || String(investor.passwordVersion) !== fields[2]) return null;
  return investor;
}

export async function startInvestorSession(investor: Investor): Promise<void> {
  const config = authConfig();
  if (!config.ok) throw new Error("Sign-in is not configured.");
  const token = signToken(config.secret, ["inv", investor.id, String(investor.passwordVersion)], Date.now(), SESSION_SECONDS);
  (await cookies()).set(INVESTOR_COOKIE, token, cookieOptions(INVESTOR_COOKIE_PATH, SESSION_SECONDS));
}

export async function endInvestorSession(): Promise<void> {
  (await cookies()).delete({ name: INVESTOR_COOKIE, path: INVESTOR_COOKIE_PATH });
}

// ---------- two-step sign-in: between the password and the code ----------

/** After a correct password: remember who is signing in for a few minutes, until they enter a code. */
export async function startTwoStepSignIn(kind: AccountKind, account: { id: string; passwordVersion: number }): Promise<void> {
  const config = authConfig();
  if (!config.ok) throw new Error("Sign-in is not configured.");
  const cookie = TWO_STEP_COOKIE[kind];
  const token = signToken(config.secret, [cookie.tag, account.id, String(account.passwordVersion)], Date.now(), TWO_STEP_PENDING_SECONDS);
  (await cookies()).set(cookie.name, token, cookieOptions(cookie.path, TWO_STEP_PENDING_SECONDS));
}

/** The account id and password version a pending sign-in is for (signed, unexpired), or null. */
async function readTwoStepCookie(kind: AccountKind): Promise<{ id: string; passwordVersion: string } | null> {
  const config = authConfig();
  if (!config.ok) return null;
  const cookie = TWO_STEP_COOKIE[kind];
  const token = (await cookies()).get(cookie.name)?.value;
  const fields = token ? readToken(token, config.secret, Date.now()) : null;
  if (!fields || fields.length !== 3 || fields[0] !== cookie.tag) return null;
  return { id: fields[1], passwordVersion: fields[2] };
}

/** The admin who entered a correct password and still needs to enter a code, or null (none, expired, or the account changed). */
export async function getPendingTwoStepAdmin(): Promise<AdminUser | null> {
  const pending = await readTwoStepCookie("admin");
  if (!pending) return null;
  const user = await getAdminUser(pending.id);
  if (!user || !user.active || !hasTwoStep(user) || String(user.passwordVersion) !== pending.passwordVersion) return null;
  return user;
}

/** The investor who entered a correct password and still needs to enter a code, or null. */
export async function getPendingTwoStepInvestor(): Promise<Investor | null> {
  const pending = await readTwoStepCookie("investor");
  if (!pending) return null;
  const investor = await getInvestor(pending.id);
  if (!investor || !investor.active || !hasTwoStep(investor) || String(investor.passwordVersion) !== pending.passwordVersion) {
    return null;
  }
  return investor;
}

export async function endTwoStepSignIn(kind: AccountKind): Promise<void> {
  const cookie = TWO_STEP_COOKIE[kind];
  (await cookies()).delete({ name: cookie.name, path: cookie.path });
}
