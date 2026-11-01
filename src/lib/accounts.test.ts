import { describe, expect, it } from "vitest";
import {
  can,
  hasTwoStep,
  setupState,
  validateEmailAddress,
  validatePersonName,
  validatePhoneNumber,
  validateUsername,
  type Credentials,
  type Permission,
} from "./accounts";

/** Every permission the app defines, kept in sync with the Permission union by hand (TypeScript catches drift at compile time if a literal here is misspelled, but not an addition to the union that this list forgets - review this list when Permission changes). */
const ALL_PERMISSIONS: Permission[] = [
  "dashboard.view",
  "inquiries.view",
  "inquiries.status",
  "inquiries.delete",
  "inquiries.convert",
  "inquiries.email",
  "inquiries.notes",
  "inquiries.assign",
  "inquiries.export",
  "investors.manage",
  "payouts.manage",
  "sources.manage",
  "rates.manage",
  "products.manage",
  "users.manage",
  "email.manage",
  "audit.view",
  "roadmap.view",
  "trading.view",
  "privacy.manage",
  "inquiries.purge",
];

const SALES_PERMISSIONS: Permission[] = [
  "dashboard.view",
  "inquiries.view",
  "inquiries.status",
  "inquiries.email",
  "inquiries.notes",
  "inquiries.assign",
  "inquiries.export",
];

describe("can (role permissions)", () => {
  it("gives Master Admin every defined permission", () => {
    for (const permission of ALL_PERMISSIONS) expect(can("master", permission), permission).toBe(true);
  });

  it("gives Sales Admin exactly the inquiry-facing permissions, and nothing money- or admin-related", () => {
    for (const permission of SALES_PERMISSIONS) expect(can("sales", permission), permission).toBe(true);
    const denied = ALL_PERMISSIONS.filter((p) => !SALES_PERMISSIONS.includes(p));
    for (const permission of denied) expect(can("sales", permission), permission).toBe(false);
  });

  it("never gives Sales Admin earnings rates, trading data or privacy requests", () => {
    expect(can("sales", "rates.manage")).toBe(false);
    expect(can("sales", "trading.view")).toBe(false);
    expect(can("sales", "privacy.manage")).toBe(false);
    expect(can("sales", "users.manage")).toBe(false);
  });
});

describe("hasTwoStep", () => {
  it("is true only once a TOTP secret is set", () => {
    expect(hasTwoStep({ totpSecret: null })).toBe(false);
    expect(hasTwoStep({ totpSecret: "encrypted-secret" })).toBe(true);
  });
});

describe("setupState", () => {
  const now = Date.parse("2026-11-01T00:00:00Z");
  const blank: Credentials = {
    passwordHash: null,
    passwordVersion: 0,
    mustChangePassword: false,
    setupTokenHash: null,
    setupExpiresAt: null,
    totpSecret: null,
    totpPendingSecret: null,
    totpEnabledAt: null,
    totpLastStep: 0,
    recoveryCodeHashes: [],
  };

  it("is active once a password hash exists, whatever the setup link says", () => {
    expect(setupState({ ...blank, passwordHash: "hash" }, now)).toBe("active");
    expect(
      setupState({ ...blank, passwordHash: "hash", setupTokenHash: "t", setupExpiresAt: new Date(now - 1).toISOString() }, now),
    ).toBe("active");
  });

  it("is not-set-up with no password and no setup link", () => {
    expect(setupState(blank, now)).toBe("not-set-up");
  });

  it("is link-pending before the link expires, link-expired after", () => {
    const pending = { ...blank, setupTokenHash: "t", setupExpiresAt: new Date(now + 60_000).toISOString() };
    expect(setupState(pending, now)).toBe("link-pending");
    const expired = { ...blank, setupTokenHash: "t", setupExpiresAt: new Date(now - 60_000).toISOString() };
    expect(setupState(expired, now)).toBe("link-expired");
  });
});

describe("validateUsername", () => {
  it.each([
    ["ap", "Use 3 to 32 lowercase letters, digits, dots, underscores or hyphens."],
    ["Apatel", "Use 3 to 32 lowercase letters, digits, dots, underscores or hyphens."],
    ["ap atel", "Use 3 to 32 lowercase letters, digits, dots, underscores or hyphens."],
    [".apatel", "Use 3 to 32 lowercase letters, digits, dots, underscores or hyphens."],
    ["a".repeat(33), "Use 3 to 32 lowercase letters, digits, dots, underscores or hyphens."],
  ])("rejects %s", (value, message) => {
    expect(validateUsername(value)).toBe(message);
  });

  it.each(["apatel", "a.b_c-9", "abc"])("accepts %s", (value) => {
    expect(validateUsername(value)).toBeNull();
  });
});

describe("validateEmailAddress", () => {
  it("requires an address unless optional", () => {
    expect(validateEmailAddress("")).toBe("Enter an email address.");
    expect(validateEmailAddress("", true)).toBeNull();
  });

  it("accepts a normal address and rejects an invalid one", () => {
    expect(validateEmailAddress("jane@example.com")).toBeNull();
    expect(validateEmailAddress("not-an-email")).toMatch(/valid email address/);
    expect(validateEmailAddress("a@b")).toMatch(/valid email address/);
  });

  it("rejects an address over the maximum length", () => {
    const long = `${"a".repeat(250)}@b.co`;
    expect(validateEmailAddress(long)).toMatch(/valid email address/);
  });
});

describe("validatePhoneNumber", () => {
  it("empty is allowed (phone is optional on its own)", () => {
    expect(validatePhoneNumber("")).toBeNull();
  });

  it("accepts 7 to 15 digits with punctuation, rejects outside that range", () => {
    expect(validatePhoneNumber("+1 (555) 010-1234")).toBeNull();
    expect(validatePhoneNumber("555123")).toMatch(/valid phone number/); // 6 digits
    expect(validatePhoneNumber("1".repeat(16))).toMatch(/valid phone number/); // 16 digits
    expect(validatePhoneNumber("abc-def-ghij")).toMatch(/valid phone number/);
  });
});

describe("validatePersonName", () => {
  it("requires a non-empty name within the length limit", () => {
    expect(validatePersonName("")).toMatch(/Enter a name/);
    expect(validatePersonName("   ")).toMatch(/Enter a name/);
    expect(validatePersonName("Jane Doe")).toBeNull();
    expect(validatePersonName("a".repeat(101))).toMatch(/at most 100/);
  });
});
