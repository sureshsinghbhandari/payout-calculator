import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Same fake in-memory private Vercel Blob store (ETag-checked) used by
 * src/lib/server/auth.test.ts and src/lib/server/rates-store.test.ts, shared
 * here by every path this test file reads or writes (investors.json, and the
 * audit log that portal actions write to on success).
 */
const blobs = vi.hoisted(() => {
  class FakeBlobError extends Error {}
  class FakePreconditionFailed extends FakeBlobError {}
  const files = new Map<string, { text: string; etag: string }>();
  let version = 0;
  return {
    files,
    reset: () => {
      files.clear();
      version = 0;
    },
    async get(pathname: string) {
      const file = files.get(pathname);
      if (!file) return null;
      return {
        statusCode: 200 as const,
        stream: new Response(file.text).body!,
        headers: new Headers(),
        blob: { etag: file.etag },
      };
    },
    async put(pathname: string, body: string, options: { allowOverwrite?: boolean; ifMatch?: string }) {
      const existing = files.get(pathname);
      if (options.ifMatch !== undefined && existing?.etag !== options.ifMatch) {
        throw new FakePreconditionFailed();
      }
      if (existing && !options.allowOverwrite) throw new FakeBlobError("This blob already exists");
      files.set(pathname, { text: body, etag: `"v${++version}"` });
      return { pathname };
    },
    async list() {
      return { blobs: [] };
    },
    FakeBlobError,
    FakePreconditionFailed,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@vercel/blob", () => ({
  BlobError: blobs.FakeBlobError,
  BlobPreconditionFailedError: blobs.FakePreconditionFailed,
  get: blobs.get,
  put: blobs.put,
  list: blobs.list,
}));

/** A minimal, mutable fake of Next's cookie jar: get/set/delete, Map-backed. */
const cookieJar = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    reset: () => store.clear(),
    get: (name: string) => (store.has(name) ? { name, value: store.get(name)! } : undefined),
    set: (name: string, value: string) => {
      store.set(name, value);
    },
    delete: (arg: string | { name: string }) => {
      store.delete(typeof arg === "string" ? arg : arg.name);
    },
  };
});

/** request headers: no x-real-ip / x-forwarded-for, so clientKey() falls back to "unknown". */
vi.mock("next/headers", () => ({
  cookies: async () => cookieJar,
  headers: async () => new Headers(),
}));

/** next/navigation's redirect() throws in real Next.js; tests assert on the target. */
class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`redirect:${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

const { investorLoginAction, investorLogoutAction, investorChangePasswordAction, investorStatementAction } = await import(
  "./actions"
);
const { createInvestor, getInvestor, updateInvestor } = await import("@/lib/server/accounts-store");
const { getCurrentInvestor, startInvestorSession, verifyInvestorCredentials } = await import("@/lib/server/auth");
const { hashPassword, verifyPassword } = await import("@/lib/server/passwords");

process.env.BLOB_READ_WRITE_TOKEN = "test-token";
process.env.ADMIN_SESSION_SECRET = "s".repeat(32);
process.env.ADMIN_PASSWORD = "bootstrap-password";
delete process.env.VERCEL_ENV;

beforeEach(() => {
  blobs.reset();
  cookieJar.reset();
});

let investorCounter = 0;

/** A fresh investor with a real (non-temporary) password, ready to sign in. */
async function makeInvestor(overrides: { active?: boolean } = {}) {
  investorCounter += 1;
  const investor = await createInvestor({
    name: "Jane Investor",
    username: `janei${investorCounter}`,
    email: "jane@example.com",
    phone: "",
    sourceInquiryId: null,
    investment: {
      principal: 50_000,
      investmentDate: "2026-11-01",
      lockInYears: 2,
      frequency: "yearly",
      payoutType: "interest-only",
      annualRatePercent: 9,
    },
  });
  await setPassword(investor.id, "a-real-password-123", false);
  if (overrides.active === false) await updateInvestor(investor.id, { active: false });
  return (await getInvestor(investor.id))!;
}

async function setPassword(investorId: string, password: string, temporary: boolean) {
  const { setInvestorPassword } = await import("@/lib/server/accounts-store");
  return setInvestorPassword(investorId, await hashPassword(password), temporary);
}

function loginForm(username: string, password: string): FormData {
  const form = new FormData();
  form.set("username", username);
  form.set("password", password);
  return form;
}

function changePasswordForm(current: string, password: string, confirm: string): FormData {
  const form = new FormData();
  form.set("current", current);
  form.set("password", password);
  form.set("confirm", confirm);
  return form;
}

describe("investorLoginAction", () => {
  it("refuses a wrong password and does not start a session", async () => {
    const investor = await makeInvestor();
    const result = await investorLoginAction({}, loginForm(investor.username, "wrong-password"));
    expect(result.error).toBe("Incorrect username or password.");
    expect(await getCurrentInvestor()).toBeNull();
  });

  it("starts a session on a correct password and redirects to the portal", async () => {
    const investor = await makeInvestor();
    await expect(investorLoginAction({}, loginForm(investor.username, "a-real-password-123"))).rejects.toMatchObject({
      url: "/portal",
    });
    const current = await getCurrentInvestor();
    expect(current?.id).toBe(investor.id);
  });

  it("a disabled investor cannot sign in", async () => {
    const investor = await makeInvestor({ active: false });
    const result = await investorLoginAction({}, loginForm(investor.username, "a-real-password-123"));
    expect(result.error).toBe("Incorrect username or password.");
    expect(await getCurrentInvestor()).toBeNull();
  });

  it("reports mustChangePassword for a temporary password, and still signs in", async () => {
    const investor = await makeInvestor();
    await setPassword(investor.id, "temporary-pass-1", true);
    const verified = await verifyInvestorCredentials(investor.username, "temporary-pass-1");
    expect(verified?.mustChangePassword).toBe(true);
    await expect(investorLoginAction({}, loginForm(investor.username, "temporary-pass-1"))).rejects.toMatchObject({
      url: "/portal",
    });
    const current = await getCurrentInvestor();
    expect(current?.id).toBe(investor.id);
    expect(current?.mustChangePassword).toBe(true);
  });
});

describe("investorLoginAction authorization", () => {
  it("still returns an error (not a redirect/throw) when sign-in storage is unavailable", async () => {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    try {
      const result = await investorLoginAction({}, loginForm("someone", "whatever-password"));
      expect(result.error).toBe("Sign-in is not available right now. Please contact us.");
    } finally {
      process.env.BLOB_READ_WRITE_TOKEN = token;
    }
  });
});

describe("investorLogoutAction", () => {
  it("ends the session and redirects to the portal", async () => {
    const investor = await makeInvestor();
    await startInvestorSession(investor);
    expect(await getCurrentInvestor()).not.toBeNull();
    await expect(investorLogoutAction()).rejects.toMatchObject({ url: "/portal" });
    expect(await getCurrentInvestor()).toBeNull();
  });

  it("is a no-op (not an error) with no session at all", async () => {
    expect(await getCurrentInvestor()).toBeNull();
    await expect(investorLogoutAction()).rejects.toMatchObject({ url: "/portal" });
    expect(await getCurrentInvestor()).toBeNull();
  });
});

describe("investorChangePasswordAction", () => {
  it("refuses with no session at all (returns an error, never throws)", async () => {
    const result = await investorChangePasswordAction(
      {},
      changePasswordForm("whatever", "a-new-password-123", "a-new-password-123"),
    );
    expect(result.error).toBe("Your session has ended. Sign in again.");
  });

  it("refuses the wrong current password", async () => {
    const investor = await makeInvestor();
    await startInvestorSession(investor);
    const result = await investorChangePasswordAction(
      {},
      changePasswordForm("wrong-current-password", "a-new-password-123", "a-new-password-123"),
    );
    expect(result.fieldErrors?.current).toBe("Your current password is incorrect.");
    // The password was not changed.
    const stored = (await getInvestor(investor.id))!;
    expect(await verifyPassword("a-real-password-123", stored.passwordHash)).toBe(true);
  });

  it("refuses a new password that is too short", async () => {
    const investor = await makeInvestor();
    await startInvestorSession(investor);
    const result = await investorChangePasswordAction(
      {},
      changePasswordForm("a-real-password-123", "short", "short"),
    );
    expect(result.fieldErrors?.password).toBe("Use at least 12 characters.");
  });

  it("refuses when the confirmation does not match", async () => {
    const investor = await makeInvestor();
    await startInvestorSession(investor);
    const result = await investorChangePasswordAction(
      {},
      changePasswordForm("a-real-password-123", "a-new-password-123", "a-different-password-123"),
    );
    expect(result.fieldErrors?.confirm).toBe("The two passwords do not match.");
  });

  it("a correct change updates the hash and bumps passwordVersion (signing out other sessions)", async () => {
    const investor = await makeInvestor();
    await startInvestorSession(investor);
    const versionBefore = investor.passwordVersion;

    await expect(
      investorChangePasswordAction({}, changePasswordForm("a-real-password-123", "a-new-password-456", "a-new-password-456")),
    ).rejects.toMatchObject({ url: "/portal?changed=1" });

    const updated = (await getInvestor(investor.id))!;
    expect(updated.passwordVersion).toBe(versionBefore + 1);
    // The old password no longer works, the new one does.
    expect(await verifyPassword("a-real-password-123", updated.passwordHash)).toBe(false);
    expect(await verifyPassword("a-new-password-456", updated.passwordHash)).toBe(true);
    // The action starts a fresh session for the caller itself, so it is still signed in...
    expect(await getCurrentInvestor()).not.toBeNull();
    // ...but any other session that still carries the OLD password version is not: this is
    // the same mechanism auth.test.ts exercises for admins (setAdminPassword bumps the
    // version), applied here directly against the store so it does not depend on a second cookie jar.
    await startInvestorSession({ ...updated, passwordVersion: versionBefore });
    expect(await getCurrentInvestor()).toBeNull();
  });

  it("refuses a new password that is the same as the current one", async () => {
    const investor = await makeInvestor();
    await startInvestorSession(investor);
    const result = await investorChangePasswordAction(
      {},
      changePasswordForm("a-real-password-123", "a-real-password-123", "a-real-password-123"),
    );
    expect(result.fieldErrors?.password).toBe("Choose a password that is different from your current one.");
  });
});

describe("investorStatementAction", () => {
  it("refuses with no session at all", async () => {
    const result = await investorStatementAction("ivt_whatever");
    expect(result).toEqual({ ok: false, error: "Your session has ended. Sign in again." });
  });

  it("refuses an investment id that does not belong to the signed-in investor", async () => {
    const investor = await makeInvestor();
    const other = await makeInvestor();
    await startInvestorSession(investor);
    const result = await investorStatementAction(other.investments[0].id);
    expect(result).toEqual({ ok: false, error: "This investment could not be found. Reload the page." });
  });

  it("builds a statement for the signed-in investor's own investment, without the earnings rate", async () => {
    const investor = await makeInvestor();
    await startInvestorSession(investor);
    const result = await investorStatementAction(investor.investments[0].id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.forAdmin).toBe(false);
      expect(result.data).not.toHaveProperty("annualRatePercent");
    }
  });

  it("refuses when the investor still has a temporary password (mustChangePassword)", async () => {
    const investor = await makeInvestor();
    await setPassword(investor.id, "temporary-pass-1", true);
    const verified = (await verifyInvestorCredentials(investor.username, "temporary-pass-1"))!.investor;
    await startInvestorSession(verified);
    const result = await investorStatementAction(verified.investments[0].id);
    expect(result).toEqual({ ok: false, error: "Your session has ended. Sign in again." });
  });
});
