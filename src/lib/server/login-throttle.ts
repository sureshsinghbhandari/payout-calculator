/**
 * Per-client attempt limiter. After `max` recorded attempts from one client
 * within `windowMs`, further attempts are refused until the window ends. Used
 * for admin sign-in failures (defaults: 5 per 15 minutes) and for inquiry
 * submissions. State is kept in memory per server instance, so this
 * complements (does not replace) a platform rate limit such as a Vercel
 * Firewall rule.
 */
export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_CLIENTS = 5_000;

interface Entry {
  failures: number;
  windowStart: number;
}

export class LoginThrottle {
  private entries = new Map<string, Entry>();

  constructor(
    private readonly max: number = MAX_FAILURES,
    private readonly windowMs: number = WINDOW_MS,
  ) {}

  /** Milliseconds until `key` may try again, or 0 when it is not blocked. */
  blockedFor(key: string, now: number): number {
    const entry = this.entries.get(key);
    if (!entry) return 0;
    const windowEnd = entry.windowStart + this.windowMs;
    if (now >= windowEnd) {
      this.entries.delete(key);
      return 0;
    }
    return entry.failures >= this.max ? windowEnd - now : 0;
  }

  recordFailure(key: string, now: number): void {
    const entry = this.entries.get(key);
    if (!entry || now >= entry.windowStart + this.windowMs) {
      if (this.entries.size >= MAX_TRACKED_CLIENTS) this.prune(now);
      this.entries.set(key, { failures: 1, windowStart: now });
    } else {
      entry.failures++;
    }
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) {
      if (now >= entry.windowStart + this.windowMs) this.entries.delete(key);
    }
    // Still full: drop the oldest entries rather than grow without bound.
    while (this.entries.size >= MAX_TRACKED_CLIENTS) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

/** Client identifier from the request headers Vercel sets (falls back to one shared key). */
export function clientKey(headers: { get(name: string): string | null }): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}
