import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { hasTwoStep, type AccountKind, type Credentials } from "../accounts";
import { encodeQr, QR_QUIET_ZONE, qrPath } from "../qr";
import {
  disableTwoStep,
  enableTwoStep,
  markTotpStepUsed,
  setTwoStepPending,
  spendRecoveryCode,
} from "./accounts-store";
import { LoginThrottle } from "./login-throttle";
import { readAuthConfig } from "./session";

/**
 * Two-step sign-in with an authenticator app: time-based one-time codes (TOTP,
 * RFC 6238: HMAC-SHA1, 6 digits, 30-second steps). A code is accepted for the
 * current step and one step either side (clocks drift), and never twice: the
 * last used step is stored with the account.
 *
 * The secret is stored encrypted with AES-256-GCM. The key is derived (HKDF)
 * from ADMIN_SESSION_SECRET, so changing that variable makes stored secrets
 * unreadable: people then sign in with a recovery code and set two-step
 * sign-in up again (or a Master Admin resets it). Recovery codes are stored as
 * SHA-256 hashes only; each one works once.
 */

export const TOTP_DIGITS = 6;
export const TOTP_STEP_SECONDS = 30;
export const RECOVERY_CODE_COUNT = 10;
const SECRET_BYTES = 20;
const RECOVERY_CODE_LENGTH = 10;
// No 0/o, 1/i/l: easy to read back from paper.
const RECOVERY_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Name shown in the authenticator app. */
const ISSUER: Record<AccountKind, string> = {
  admin: "Payout Calculator Admin",
  investor: "Payout Calculator",
};

// ---------- TOTP ----------

function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** The code for one time step (RFC 4226 dynamic truncation). */
function totpCode(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", secret).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/** The time step a code matches (current step ±1, later than `lastStep`), or null. */
function matchTotp(secret: Buffer, code: string, nowMs: number, lastStep: number): number | null {
  const now = Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
  let match: number | null = null;
  // Every step is compared (in constant time), so timing does not tell which one matched.
  for (const step of [now - 1, now, now + 1]) {
    const equal = timingSafeEqual(Buffer.from(totpCode(secret, step)), Buffer.from(code));
    if (equal && step > lastStep && match === null) match = step;
  }
  return match;
}

// ---------- encryption at rest ----------

function encryptionKey(): Buffer {
  const config = readAuthConfig(process.env);
  if (!config.ok) throw new Error("Two-step sign-in needs ADMIN_SESSION_SECRET.");
  return Buffer.from(hkdfSync("sha256", config.secret, "payout-calculator", "two-step-secret-v1", 32));
}

/** "v1.<iv>.<ciphertext>.<tag>" (base64url). The account id is bound in, so a secret cannot be moved to another account. */
function encryptSecret(secret: Buffer, kind: AccountKind, id: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`${kind}:${id}`));
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
  return ["v1", iv, ciphertext, cipher.getAuthTag()]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

/** The secret, or null when it cannot be read (damaged, or ADMIN_SESSION_SECRET changed). */
function decryptSecret(stored: string, kind: AccountKind, id: string): Buffer | null {
  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const [iv, ciphertext, tag] = parts.slice(1).map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAAD(Buffer.from(`${kind}:${id}`));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    return null;
  }
}

// ---------- recovery codes ----------

function newRecoveryCode(): string {
  let code = "";
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) code += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

function hashRecoveryCode(kind: AccountKind, id: string, normalized: string): string {
  return createHash("sha256").update(`two-step-recovery\u0000${kind}:${id}\u0000${normalized}`).digest("base64url");
}

/** What was typed: an app code, a recovery code, or neither. Spaces and hyphens are ignored. */
function readCode(input: string): { type: "app" | "recovery"; value: string } | null {
  const value = input.trim().toLowerCase().replace(/[\s-]/g, "");
  if (new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(value)) return { type: "app", value };
  if (value.length === RECOVERY_CODE_LENGTH && [...value].every((c) => RECOVERY_ALPHABET.includes(c))) {
    return { type: "recovery", value };
  }
  return null;
}

// ---------- attempt limits ----------

// Wrong codes: 5 per account and 20 per client in 15 minutes. In memory per
// server instance, like the sign-in limit.
const accountThrottle = new LoginThrottle(5, 15 * 60 * 1000);
const clientThrottle = new LoginThrottle(20, 15 * 60 * 1000);

/** Milliseconds until this account (or client) may try another code, or 0. */
export function codeAttemptsBlockedFor(kind: AccountKind, id: string, client: string): number {
  const now = Date.now();
  return Math.max(accountThrottle.blockedFor(`${kind}:${id}`, now), clientThrottle.blockedFor(client, now));
}

/** Counts a wrong code (or a wrong password when turning two-step sign-in off) towards the limits. */
export function recordTwoStepFailure(kind: AccountKind, id: string, client: string): void {
  const now = Date.now();
  accountThrottle.recordFailure(`${kind}:${id}`, now);
  clientThrottle.recordFailure(client, now);
}

export function tooManyCodesMessage(waitMs: number): string {
  const minutes = Math.ceil(waitMs / 60_000);
  return `Too many wrong codes. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

// ---------- checking a code ----------

type AccountRef = Credentials & { id: string };

export type CodeCheck =
  | { ok: true; method: "app" }
  | { ok: true; method: "recovery"; recoveryCodesLeft: number }
  /** `blocked`: refused because of too many wrong codes (the code was not checked). */
  | { ok: false; error: string; blocked?: boolean };

const WRONG_CODE = "That code is not correct, or it was already used. Wait for the next code in your app and try again.";

/**
 * Checks a code from the authenticator app (or a recovery code, when
 * `allowRecovery`) for an account that has two-step sign-in on, and marks it
 * used. Counts wrong codes towards the attempt limit. Never logs the code.
 */
export async function checkTwoStepCode(
  kind: AccountKind,
  account: AccountRef,
  input: string,
  client: string,
  options: { allowRecovery: boolean },
): Promise<CodeCheck> {
  const waitMs = codeAttemptsBlockedFor(kind, account.id, client);
  if (waitMs > 0) return { ok: false, error: tooManyCodesMessage(waitMs), blocked: true };
  if (!hasTwoStep(account) || !account.totpSecret) return { ok: false, error: WRONG_CODE };

  const code = readCode(input.slice(0, 40));
  if (code?.type === "app") {
    const secret = decryptSecret(account.totpSecret, kind, account.id);
    const step = secret ? matchTotp(secret, code.value, Date.now(), account.totpLastStep) : null;
    if (step !== null && (await markTotpStepUsed(kind, account.id, step))) {
      accountThrottle.reset(`${kind}:${account.id}`);
      return { ok: true, method: "app" };
    }
  } else if (code?.type === "recovery" && options.allowRecovery) {
    const hash = hashRecoveryCode(kind, account.id, code.value);
    // Only write when the code looks right; the store checks again before using it up.
    const left = account.recoveryCodeHashes.includes(hash) ? await spendRecoveryCode(kind, account.id, hash) : null;
    if (left !== null) {
      accountThrottle.reset(`${kind}:${account.id}`);
      return { ok: true, method: "recovery", recoveryCodesLeft: left };
    }
  }

  recordTwoStepFailure(kind, account.id, client);
  return { ok: false, error: wrongCodeMessage(code?.type ?? null, options.allowRecovery) };
}

function wrongCodeMessage(type: "app" | "recovery" | null, allowRecovery: boolean): string {
  if (type === "app") return WRONG_CODE;
  if (type === "recovery" && allowRecovery) return "That recovery code is not correct, or it was already used.";
  return allowRecovery
    ? "Enter the 6-digit code from your authenticator app, or one of your recovery codes."
    : "Enter the 6-digit code from your authenticator app.";
}

// ---------- setting it up ----------

/** Starts a new setup: a fresh secret, stored encrypted until the person confirms it with a code. */
export async function beginTwoStepSetup(kind: AccountKind, id: string): Promise<void> {
  await setTwoStepPending(kind, id, encryptSecret(randomBytes(SECRET_BYTES), kind, id));
}

export function cancelTwoStepSetup(kind: AccountKind, id: string): Promise<void> {
  return setTwoStepPending(kind, id, null);
}

export interface TwoStepSetupDetails {
  /** The secret in base32, in groups of four for typing it in by hand. */
  secretText: string;
  /** SVG path of the QR code (see qr.ts) and its size in modules, including the light border. */
  qrPath: string;
  qrSize: number;
}

/** What the person scans or types into their app for a pending setup, or null when there is none (or it cannot be read). */
export function pendingSetupDetails(
  kind: AccountKind,
  account: AccountRef & { username: string },
): TwoStepSetupDetails | null {
  if (!account.totpPendingSecret) return null;
  const secret = decryptSecret(account.totpPendingSecret, kind, account.id);
  if (!secret) return null;
  const base32 = base32Encode(secret);
  const issuer = ISSUER[kind];
  // otpauth://totp/Issuer:account?secret=…&issuer=… (SHA-1, 6 digits and 30 seconds are the defaults).
  const url = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account.username)}?secret=${base32}&issuer=${encodeURIComponent(issuer)}`;
  const modules = encodeQr(url);
  return {
    secretText: base32.match(/.{1,4}/g)?.join(" ") ?? base32,
    qrPath: qrPath(modules),
    qrSize: modules.length + QR_QUIET_ZONE * 2,
  };
}

export type ConfirmResult = { ok: true; recoveryCodes: string[] } | { ok: false; error: string };

/**
 * Turns two-step sign-in on once the person entered a correct code for the
 * pending secret. Returns the recovery codes, which are shown once; only
 * their hashes are stored.
 */
export async function confirmTwoStepSetup(
  kind: AccountKind,
  account: AccountRef,
  input: string,
  client: string,
): Promise<ConfirmResult> {
  const waitMs = codeAttemptsBlockedFor(kind, account.id, client);
  if (waitMs > 0) return { ok: false, error: tooManyCodesMessage(waitMs) };
  const pending = account.totpPendingSecret;
  const secret = pending ? decryptSecret(pending, kind, account.id) : null;
  if (!pending || !secret) return { ok: false, error: "This setup has ended. Reload the page and start again." };

  const code = readCode(input.slice(0, 40));
  if (code?.type !== "app") return { ok: false, error: "Enter the 6-digit code your authenticator app shows." };
  const step = matchTotp(secret, code.value, Date.now(), account.totpLastStep);
  if (step === null) {
    recordTwoStepFailure(kind, account.id, client);
    return {
      ok: false,
      error:
        "That code is not correct. Check that you scanned the code on this page, and that your phone's time is set automatically.",
    };
  }

  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
  const hashes = recoveryCodes.map((c) => hashRecoveryCode(kind, account.id, c.replace("-", "")));
  if (!(await enableTwoStep(kind, account.id, pending, step, hashes))) {
    return { ok: false, error: "This setup changed in another window. Reload the page and start again." };
  }
  accountThrottle.reset(`${kind}:${account.id}`);
  return { ok: true, recoveryCodes };
}

/** Turns two-step sign-in off: by the person themselves, or a reset by a Master Admin. */
export function turnOffTwoStep(kind: AccountKind, id: string): Promise<void> {
  return disableTwoStep(kind, id);
}
