import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type { BankDetails } from "../profile-requests";
import { MIN_SECRET_LENGTH } from "./session";

/**
 * Bank details are encrypted at rest with AES-256-GCM. The key is derived
 * (HKDF-SHA256) from ADMIN_SESSION_SECRET, so the stored files alone never
 * reveal an account number. Each value is bound to its investor (as
 * additional authenticated data), so it cannot be copied to another investor.
 *
 * Changing ADMIN_SESSION_SECRET makes stored bank details unreadable: they
 * then show as "could not be read" and the investor has to send them again.
 *
 * Format: "v1.<iv>.<tag>.<ciphertext>", each part base64url.
 */
const VERSION = "v1";
const IV_BYTES = 12;

export class BankCryptoError extends Error {}

export function isBankEncryptionAvailable(): boolean {
  return (process.env.ADMIN_SESSION_SECRET ?? "").length >= MIN_SECRET_LENGTH;
}

function key(): Buffer {
  const secret = process.env.ADMIN_SESSION_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH) throw new BankCryptoError("ADMIN_SESSION_SECRET is not set.");
  return Buffer.from(hkdfSync("sha256", secret, "payout-calculator", "bank-details-v1", 32));
}

function aad(investorId: string): Buffer {
  return Buffer.from(`bank-details:${investorId}`);
}

export function encryptBankDetails(details: BankDetails, investorId: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(aad(investorId));
  const plain: BankDetails = {
    accountHolder: details.accountHolder,
    bankName: details.bankName,
    routingCode: details.routingCode,
    accountNumber: details.accountNumber,
  };
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(plain), "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

/** The bank details, or null when the value is damaged or was encrypted with another secret. */
export function decryptBankDetails(encrypted: string, investorId: string): BankDetails | null {
  const parts = encrypted.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const [iv, tag, ciphertext] = parts.slice(1).map((p) => Buffer.from(p, "base64url"));
    if (iv.length !== IV_BYTES || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAAD(aad(investorId));
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const d = JSON.parse(plain) as Record<string, unknown>;
    const fields = [d.accountHolder, d.bankName, d.routingCode, d.accountNumber];
    if (!fields.every((f) => typeof f === "string")) return null;
    return {
      accountHolder: d.accountHolder as string,
      bankName: d.bankName as string,
      routingCode: d.routingCode as string,
      accountNumber: d.accountNumber as string,
    };
  } catch {
    return null;
  }
}
