import "server-only";
import { cookies } from "next/headers";
import {
  createScopedToken,
  createSessionToken,
  passwordMatches,
  readAdminConfig,
  SESSION_SECONDS,
  verifyScopedToken,
  verifySessionToken,
  type AdminConfig,
} from "./session";

export const ADMIN_COOKIE = "payout_admin_session";
const COOKIE_PATH = "/admin";

export function adminConfig(): AdminConfig {
  return readAdminConfig(process.env);
}

export function checkAdminPassword(candidate: string): boolean {
  const config = adminConfig();
  return config.ok && passwordMatches(config, candidate);
}

/** True when the request carries a valid, unexpired admin session cookie. */
export async function isAdmin(): Promise<boolean> {
  const config = adminConfig();
  if (!config.ok) return false;
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return token ? verifySessionToken(token, config, Date.now()) : false;
}

export async function startAdminSession(): Promise<void> {
  const config = adminConfig();
  if (!config.ok) throw new Error("Admin access is not configured.");
  (await cookies()).set(ADMIN_COOKIE, createSessionToken(config, Date.now()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: COOKIE_PATH,
    maxAge: SESSION_SECONDS,
  });
}

export async function endAdminSession(): Promise<void> {
  (await cookies()).delete({ name: ADMIN_COOKIE, path: COOKIE_PATH });
}

/** Rate editing is locked until the admin re-enters the password. */
const RATES_UNLOCK_COOKIE = "payout_rates_unlock";
const RATES_UNLOCK_PATH = "/admin/settings/rates";
const RATES_UNLOCK_SCOPE = "rates-unlock";
export const RATES_UNLOCK_SECONDS = 10 * 60;

export async function isRatesUnlocked(): Promise<boolean> {
  const config = adminConfig();
  if (!config.ok) return false;
  const token = (await cookies()).get(RATES_UNLOCK_COOKIE)?.value;
  return token ? verifyScopedToken(token, config, RATES_UNLOCK_SCOPE, Date.now()) : false;
}

export async function unlockRates(): Promise<void> {
  const config = adminConfig();
  if (!config.ok) throw new Error("Admin access is not configured.");
  (await cookies()).set(
    RATES_UNLOCK_COOKIE,
    createScopedToken(config, RATES_UNLOCK_SCOPE, Date.now(), RATES_UNLOCK_SECONDS),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: RATES_UNLOCK_PATH,
      maxAge: RATES_UNLOCK_SECONDS,
    },
  );
}

export async function lockRates(): Promise<void> {
  (await cookies()).delete({ name: RATES_UNLOCK_COOKIE, path: RATES_UNLOCK_PATH });
}
