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
