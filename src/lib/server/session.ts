/**
 * Admin session tokens: "v1.<expiry seconds>.<HMAC-SHA256 signature>".
 *
 * The signing key is derived from both ADMIN_SESSION_SECRET and
 * ADMIN_PASSWORD, so changing either one signs every admin out.
 * Pure functions (no request access) so they can be unit tested.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_SECONDS = 8 * 60 * 60;
export const MIN_PASSWORD_LENGTH = 12;
export const MIN_SECRET_LENGTH = 32;

export type AdminConfig =
  | { ok: true; password: string; secret: string }
  | { ok: false; reason: string };

export function readAdminConfig(env: Record<string, string | undefined>): AdminConfig {
  const password = env.ADMIN_PASSWORD ?? "";
  const secret = env.ADMIN_SESSION_SECRET ?? "";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      reason: `ADMIN_PASSWORD is not set or is shorter than ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    return {
      ok: false,
      reason: `ADMIN_SESSION_SECRET is not set or is shorter than ${MIN_SECRET_LENGTH} characters.`,
    };
  }
  return { ok: true, password, secret };
}

/** Constant-time string comparison (hashes first so lengths do not leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function passwordMatches(config: { password: string }, candidate: string): boolean {
  return safeEqual(candidate, config.password);
}

function signingKey(config: { password: string; secret: string }): Buffer {
  return createHmac("sha256", config.secret).update(`admin-session\u0000${config.password}`).digest();
}

function signature(payload: string, config: { password: string; secret: string }): string {
  return createHmac("sha256", signingKey(config)).update(payload).digest("base64url");
}

export function createSessionToken(config: { password: string; secret: string }, nowMs: number): string {
  const expires = Math.floor(nowMs / 1000) + SESSION_SECONDS;
  const payload = `v1.${expires}`;
  return `${payload}.${signature(payload, config)}`;
}

export function verifySessionToken(
  token: string,
  config: { password: string; secret: string },
  nowMs: number,
): boolean {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !/^\d+$/.test(parts[1])) return false;
  const expires = Number(parts[1]);
  if (!Number.isSafeInteger(expires) || expires * 1000 <= nowMs) return false;
  return safeEqual(parts[2], signature(`${parts[0]}.${parts[1]}`, config));
}

/**
 * Short-lived tokens for a specific purpose (e.g. "rates-unlock"), signed with
 * the same key: "<scope>.<expiry seconds>.<signature>".
 */
export function createScopedToken(
  config: { password: string; secret: string },
  scope: string,
  nowMs: number,
  ttlSeconds: number,
): string {
  const expires = Math.floor(nowMs / 1000) + ttlSeconds;
  const payload = `${scope}.${expires}`;
  return `${payload}.${signature(payload, config)}`;
}

export function verifyScopedToken(
  token: string,
  config: { password: string; secret: string },
  scope: string,
  nowMs: number,
): boolean {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== scope || !/^\d+$/.test(parts[1])) return false;
  const expires = Number(parts[1]);
  if (!Number.isSafeInteger(expires) || expires * 1000 <= nowMs) return false;
  return safeEqual(parts[2], signature(`${parts[0]}.${parts[1]}`, config));
}

// ---------- multi-user sessions ----------

export type AuthConfig = { ok: true; secret: string; bootstrapPassword: string | null } | { ok: false; reason: string };

/**
 * ADMIN_SESSION_SECRET signs every session. ADMIN_PASSWORD is now only the
 * one-time bootstrap password for the first Master Admin (see accounts.ts).
 */
export function readAuthConfig(env: Record<string, string | undefined>): AuthConfig {
  const secret = env.ADMIN_SESSION_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    return { ok: false, reason: `ADMIN_SESSION_SECRET is not set or is shorter than ${MIN_SECRET_LENGTH} characters.` };
  }
  const bootstrap = env.ADMIN_PASSWORD ?? "";
  return { ok: true, secret, bootstrapPassword: bootstrap.length >= MIN_PASSWORD_LENGTH ? bootstrap : null };
}

function tokenSignature(secret: string, payload: string): string {
  const key = createHmac("sha256", secret).update("payout-calculator-token").digest();
  return createHmac("sha256", key).update(payload).digest("base64url");
}

/** Signs `fields` (no dots allowed) with an expiry: "<f1>.<f2>...<expiry>.<signature>". */
export function signToken(secret: string, fields: string[], nowMs: number, ttlSeconds: number): string {
  if (fields.some((f) => f === "" || f.includes("."))) throw new Error("Invalid token field.");
  const payload = `${fields.join(".")}.${Math.floor(nowMs / 1000) + ttlSeconds}`;
  return `${payload}.${tokenSignature(secret, payload)}`;
}

/** Returns the signed fields if the token is authentic and unexpired, otherwise null. */
export function readToken(token: string, secret: string, nowMs: number): string[] | null {
  const parts = token.split(".");
  if (parts.length < 3) return null;
  const sig = parts[parts.length - 1];
  const expiry = parts[parts.length - 2];
  if (!/^\d+$/.test(expiry) || Number(expiry) * 1000 <= nowMs) return null;
  const payload = parts.slice(0, -1).join(".");
  if (!safeEqual(sig, tokenSignature(secret, payload))) return null;
  return parts.slice(0, -2);
}
