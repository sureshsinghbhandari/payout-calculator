import "server-only";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Password hashing (scrypt) and one-time setup tokens.
 * Stored format: "scrypt$N$r$p$<salt base64url>$<hash base64url>".
 */
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;

export const MIN_USER_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 200;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (![n, r, p].every((v) => Number.isSafeInteger(v) && v > 0)) return false;
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  const actual = await derive(password, salt, n, r, p);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Checks a new password and its confirmation. Returns an error message or null. */
export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_USER_PASSWORD_LENGTH) {
    return `Use at least ${MIN_USER_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  if (password !== confirm) return "The two passwords do not match.";
  return null;
}

/** A random one-time token (shown once, never stored in plain text). */
export function newSetupToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSetupToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}
