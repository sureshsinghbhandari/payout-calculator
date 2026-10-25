import { describe, expect, it } from "vitest";
import { DISCLAIMER } from "./disclaimer";
import { parseQuoteInputs } from "./quote";
import {
  defaultStoredRates,
  nextStoredRates,
  parseStoredRates,
  validateRateTable,
  type StoredRates,
} from "./rates";
import {
  createSessionToken,
  passwordMatches,
  readAdminConfig,
  safeEqual,
  SESSION_SECONDS,
  verifySessionToken,
} from "./server/session";

describe("parseQuoteInputs (server-side validation of public requests)", () => {
  const valid = {
    principal: 100_000,
    lockInYears: 2,
    frequency: "yearly",
    payoutType: "interest-only",
    investmentDate: "2026-10-25",
  };

  it("accepts a valid request and ignores extra fields such as a rate", () => {
    const result = parseQuoteInputs({ ...valid, annualRatePercent: 99 });
    expect(result).toEqual({ ok: true, value: valid });
  });

  it.each([
    [null, "Invalid request."],
    ["text", "Invalid request."],
    [{ ...valid, principal: 30_000 }, "Choose one of the listed investment amounts."],
    [{ ...valid, principal: "100000" }, "Choose one of the listed investment amounts."],
    [{ ...valid, lockInYears: 3 }, "Choose a lock-in period of 1 or 2 years."],
    [{ ...valid, frequency: "monthly" }, "Choose a payout period."],
    [{ ...valid, frequency: "toString" }, "Choose a payout period."],
    [{ ...valid, payoutType: "principal-only" }, "Choose a payout type."],
    [{ ...valid, payoutType: "__proto__" }, "Choose a payout type."],
    [{ ...valid, investmentDate: "" }, "Enter an investment date."],
    [{ ...valid, investmentDate: "2026-02-30" }, "Enter a valid investment date."],
    [{ ...valid, investmentDate: 20261025 }, "Enter an investment date."],
  ])("rejects %j", (input, error) => {
    expect(parseQuoteInputs(input)).toEqual({ ok: false, error });
  });
});

describe("validateRateTable", () => {
  it("accepts rates for every frequency", () => {
    expect(validateRateTable({ quarterly: "8", "half-yearly": "9.25", yearly: 10 })).toEqual({
      ok: true,
      value: { quarterly: 8, "half-yearly": 9.25, yearly: 10 },
    });
  });

  it("reports each invalid or missing rate", () => {
    const result = validateRateTable({ quarterly: "", "half-yearly": "150", yearly: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual({
        quarterly: "Quarterly: Enter an annual interest rate.",
        "half-yearly": "Half-Yearly: Interest rate must be between 0% and 100%.",
        yearly: "Yearly: Enter an annual interest rate.",
      });
    }
  });
});

describe("stored rates", () => {
  it("round-trips through JSON and keeps the newest history first", () => {
    let stored: StoredRates = defaultStoredRates();
    expect(stored).toEqual({ rates: { quarterly: 8, "half-yearly": 9, yearly: 10 }, savedAt: null, history: [] });
    stored = nextStoredRates(stored, { quarterly: 7, "half-yearly": 8, yearly: 9 }, "2026-10-25T10:00:00.000Z", 20);
    stored = nextStoredRates(stored, { quarterly: 7.5, "half-yearly": 8, yearly: 9 }, "2026-10-26T10:00:00.000Z", 20);
    const parsed = parseStoredRates(JSON.stringify(stored));
    expect(parsed.rates).toEqual({ quarterly: 7.5, "half-yearly": 8, yearly: 9 });
    expect(parsed.savedAt).toBe("2026-10-26T10:00:00.000Z");
    expect(parsed.history.map((h) => h.savedAt)).toEqual(["2026-10-26T10:00:00.000Z", "2026-10-25T10:00:00.000Z"]);
  });

  it("caps the history", () => {
    let stored = defaultStoredRates();
    for (let i = 0; i < 25; i++) {
      stored = nextStoredRates(stored, { quarterly: i, "half-yearly": 9, yearly: 10 }, `2026-10-${String(i + 1).padStart(2, "0")}`, 20);
    }
    expect(stored.history).toHaveLength(20);
    expect(stored.history[0].rates.quarterly).toBe(24);
  });

  it("drops unknown keys and skips broken history entries", () => {
    const parsed = parseStoredRates(
      JSON.stringify({
        rates: { quarterly: 8, "half-yearly": 9, yearly: 10, monthly: 99 },
        savedAt: "2026-10-25T10:00:00.000Z",
        history: [null, { rates: { quarterly: "x" }, savedAt: "a" }, { rates: { quarterly: 8, "half-yearly": 9, yearly: 10 } }],
      }),
    );
    expect(parsed.rates).toEqual({ quarterly: 8, "half-yearly": 9, yearly: 10 });
    expect(parsed.history).toEqual([]);
  });

  it("refuses invalid current rates instead of guessing", () => {
    expect(() => parseStoredRates(JSON.stringify({ rates: { quarterly: 8, "half-yearly": 900, yearly: 10 } }))).toThrow();
    expect(() => parseStoredRates("not json")).toThrow();
  });
});

describe("admin sessions", () => {
  const config = { password: "correct horse battery staple", secret: "s".repeat(32) };
  const now = Date.UTC(2026, 9, 25, 12, 0, 0);

  it("requires a strong password and secret", () => {
    expect(readAdminConfig({}).ok).toBe(false);
    expect(readAdminConfig({ ADMIN_PASSWORD: "short", ADMIN_SESSION_SECRET: "s".repeat(32) }).ok).toBe(false);
    expect(readAdminConfig({ ADMIN_PASSWORD: config.password, ADMIN_SESSION_SECRET: "short" }).ok).toBe(false);
    expect(readAdminConfig({ ADMIN_PASSWORD: config.password, ADMIN_SESSION_SECRET: config.secret })).toEqual({
      ok: true,
      ...config,
    });
  });

  it("checks the password in constant time", () => {
    expect(passwordMatches(config, config.password)).toBe(true);
    expect(passwordMatches(config, "correct horse battery stapl")).toBe(false);
    expect(passwordMatches(config, "")).toBe(false);
    expect(safeEqual("a", "a")).toBe(true);
    expect(safeEqual("a", "ab")).toBe(false);
  });

  it("accepts its own token until it expires", () => {
    const token = createSessionToken(config, now);
    expect(verifySessionToken(token, config, now)).toBe(true);
    expect(verifySessionToken(token, config, now + (SESSION_SECONDS - 1) * 1000)).toBe(true);
    expect(verifySessionToken(token, config, now + SESSION_SECONDS * 1000)).toBe(false);
  });

  it("rejects tampered, foreign or malformed tokens", () => {
    const token = createSessionToken(config, now);
    const [v, exp, sig] = token.split(".");
    expect(verifySessionToken(`${v}.${Number(exp) + 3600}.${sig}`, config, now)).toBe(false);
    expect(verifySessionToken(`${v}.${exp}.${sig.slice(0, -1)}x`, config, now)).toBe(false);
    expect(verifySessionToken(token, { ...config, secret: "t".repeat(32) }, now)).toBe(false);
    expect(verifySessionToken(token, { ...config, password: "a different long password" }, now)).toBe(false);
    for (const bad of ["", "v1", "v1.123", "v2.9999999999.abc", "v1.abc.def", "v1.9999999999.", "a.b.c.d"]) {
      expect(verifySessionToken(bad, config, now)).toBe(false);
    }
  });
});

describe("disclaimer", () => {
  it("keeps the original wording and adds the business-day assumption", () => {
    expect(DISCLAIMER).toContain(
      "This calculator provides illustrative estimates based on the selected assumptions.",
    );
    expect(DISCLAIMER).toContain(
      "Actual returns, payment timing, taxes, fees, and principal repayment may differ.",
    );
    expect(DISCLAIMER).toContain(
      "This calculator is not a guarantee of investment performance or a substitute for professional financial advice.",
    );
    expect(DISCLAIMER).toContain(
      "Interest is assumed to start on the next business day after the investment date, counting Monday to Friday as business days; public holidays are not taken into account.",
    );
  });
});
