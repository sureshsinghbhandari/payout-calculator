import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  BOOTSTRAP_MASTER_USERNAME,
  can,
  normalizeUsername,
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
 * password is required, to /admin/inquiries when the role lacks permission).
 *
 * Server actions: `requireAdminPermission(permission)` returns the admin or
 * null; always check it first, because actions are public endpoints.
 *
 * Investors: `getCurrentInvestor()`, `verifyInvestorCredentials`,
 * `startInvestorSession`, `endInvestorSession`.
 */

const ADMIN_COOKIE = "payout_admin_session";
const ADMIN_COOKIE_PATH = "/admin";
const INVESTOR_COOKIE = "payout_investor_session";
const INVESTOR_COOKIE_PATH = "/investor";
const RATES_UNLOCK_COOKIE = "payout_rates_unlock";
const RATES_UNLOCK_PATH = "/admin/settings/rates";
export const RATES_UNLOCK_SECONDS = 10 * 60;

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

/** For server actions: the signed-in admin if their role has `permission`, else null. */
export async function requireAdminPermission(permission: Permission): Promise<AdminUser | null> {
  const user = await getCurrentAdmin();
  if (!user || needsNewPassword(user) || !can(user.role, permission)) return null;
  return user;
}

/** For server components: the signed-in admin, or a redirect. */
export async function requireAdminPage(permission?: Permission, options?: { allowPasswordChange?: boolean }): Promise<AdminUser> {
  const user = await getCurrentAdmin();
  if (!user) redirect("/admin");
  if (needsNewPassword(user) && !options?.allowPasswordChange) redirect("/admin/account");
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
