import "server-only";
import { createHmac } from "node:crypto";
import { clientKey } from "./login-throttle";

/**
 * A short, privacy-friendly label for "where" a sign-in came from: a keyed
 * hash of the network (an IPv4 address without its last part, or the first
 * three groups of an IPv6 address) and the browser's user agent. The address
 * and user agent are never stored, and without the server secret the hash
 * cannot be traced back to them. The same device on the same network gives
 * the same value, so sign-ins from a new device or network stand out.
 */
export function signInClientHash(headers: { get(name: string): string | null }, secret: string): string {
  const ip = clientKey(headers);
  const network = ip.includes(":")
    ? ip.split(":").slice(0, 3).join(":")
    : ip.split(".").slice(0, 3).join(".");
  const userAgent = (headers.get("user-agent") ?? "").slice(0, 512);
  return createHmac("sha256", secret)
    .update(`sign-in-client\u0000${network}\u0000${userAgent}`)
    .digest("hex")
    .slice(0, 12);
}
