import "server-only";
import { cookies } from "next/headers";
import {
  createSessionToken,
  passwordMatches,
  readAdminConfig,
  SESSION_SECONDS,
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
