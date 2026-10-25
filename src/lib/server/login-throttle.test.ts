import { describe, expect, it } from "vitest";
import { clientKey, LoginThrottle, MAX_FAILURES, WINDOW_MS } from "./login-throttle";

const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });

describe("LoginThrottle", () => {
  it("blocks a client after too many failures and frees it when the window ends", () => {
    const throttle = new LoginThrottle();
    const t0 = 1_000_000;
    for (let i = 0; i < MAX_FAILURES - 1; i++) throttle.recordFailure("1.2.3.4", t0 + i);
    expect(throttle.blockedFor("1.2.3.4", t0 + 10)).toBe(0);
    throttle.recordFailure("1.2.3.4", t0 + 20);
    expect(throttle.blockedFor("1.2.3.4", t0 + 30)).toBe(WINDOW_MS - 30);
    expect(throttle.blockedFor("5.6.7.8", t0 + 30)).toBe(0); // other clients unaffected
    expect(throttle.blockedFor("1.2.3.4", t0 + WINDOW_MS)).toBe(0);
  });

  it("starts a fresh window after the old one expires", () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < MAX_FAILURES - 1; i++) throttle.recordFailure("ip", 0);
    throttle.recordFailure("ip", WINDOW_MS + 1); // new window, count 1
    expect(throttle.blockedFor("ip", WINDOW_MS + 2)).toBe(0);
  });

  it("clears a client after a successful sign-in", () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < MAX_FAILURES; i++) throttle.recordFailure("ip", 0);
    throttle.reset("ip");
    expect(throttle.blockedFor("ip", 1)).toBe(0);
  });

  it("keeps memory bounded", () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < 6_000; i++) throttle.recordFailure(`ip-${i}`, i);
    expect(throttle.blockedFor("ip-5999", 6_000)).toBe(0);
    expect((throttle as unknown as { entries: Map<string, unknown> }).entries.size).toBeLessThanOrEqual(5_000);
  });
});

describe("clientKey", () => {
  it("prefers x-real-ip, then the first x-forwarded-for address", () => {
    expect(clientKey(headers({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" }))).toBe("9.9.9.9");
    expect(clientKey(headers({ "x-forwarded-for": "1.1.1.1, 10.0.0.1" }))).toBe("1.1.1.1");
    expect(clientKey(headers({}))).toBe("unknown");
  });
});
