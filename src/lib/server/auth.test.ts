import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A fake in-memory private Vercel Blob store with ETag checks, shared by
 * every path this test file reads or writes (admin-users.json,
 * investors.json). Same shape and behaviour as rates-store.test.ts's fake.
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

vi.mock("next/headers", () => ({ cookies: async () => cookieJar }));

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

const { authConfig, endAdminSession, getCurrentAdmin, getPendingTwoStepAdmin, requireAdminPage, requireAdminPermission, startAdminSession, startTwoStepSignIn, endTwoStepSignIn, verifyAdminCredentials, getCurrentInvestor, startInvestorSession, verifyInvestorCredentials } = await import("./auth");
const { createAdminUser, createInvestor, enableTwoStep, setAdminPassword, setInvestorPassword, setTwoStepPending } = await import("./accounts-store");

process.env.BLOB_READ_WRITE_TOKEN = "test-token";
process.env.ADMIN_SESSION_SECRET = "s".repeat(32);
process.env.ADMIN_PASSWORD = "bootstrap-password";
delete process.env.VERCEL_ENV;

/** apatel's bootstrap sign-in always has mustChangePassword: true; give it a real one, as the real flow does. */
async function readyMaster() {
  const { user } = (await verifyAdminCredentials("apatel", "bootstrap-password"))!;
  const { hashPassword } = await import("./passwords");
  await setAdminPassword(user.id, await hashPassword("a-real-master-password"), false);
  return (await verifyAdminCredentials("apatel", "a-real-master-password"))!.user;
}

beforeEach(() => {
  blobs.reset();
  cookieJar.reset();
});

describe("authConfig / readAuthConfig wiring", () => {
  it("is configured when ADMIN_SESSION_SECRET is long enough", () => {
    expect(authConfig().ok).toBe(true);
  });
});

describe("admin bootstrap sign-in (apatel, no password set yet)", () => {
  it("accepts the ADMIN_PASSWORD bootstrap password and reports mustChangePassword", async () => {
    const result = await verifyAdminCredentials("apatel", "bootstrap-password");
    expect(result).not.toBeNull();
    expect(result!.user.username).toBe("apatel");
    expect(result!.user.role).toBe("master");
    expect(result!.mustChangePassword).toBe(true);
  });

  it("rejects the wrong bootstrap password", async () => {
    expect(await verifyAdminCredentials("apatel", "wrong-password")).toBeNull();
  });

  it("rejects an unknown username without revealing that (same null result)", async () => {
    expect(await verifyAdminCredentials("nobody", "bootstrap-password")).toBeNull();
  });

  it("is case-insensitive on username (normalized before lookup)", async () => {
    const result = await verifyAdminCredentials("APATEL", "bootstrap-password");
    expect(result?.user.username).toBe("apatel");
  });
});

describe("admin session: start, read, end", () => {
  it("getCurrentAdmin is null with no session cookie", async () => {
    expect(await getCurrentAdmin()).toBeNull();
  });

  it("round-trips a session: start -> getCurrentAdmin finds the same user", async () => {
    const { user } = (await verifyAdminCredentials("apatel", "bootstrap-password"))!;
    await startAdminSession(user);
    const current = await getCurrentAdmin();
    expect(current?.id).toBe(user.id);
  });

  it("endAdminSession clears it: getCurrentAdmin goes back to null", async () => {
    const { user } = (await verifyAdminCredentials("apatel", "bootstrap-password"))!;
    await startAdminSession(user);
    await endAdminSession();
    expect(await getCurrentAdmin()).toBeNull();
  });

  it("a changed password version signs out the old session (the stored user's version moved on)", async () => {
    const { user } = (await verifyAdminCredentials("apatel", "bootstrap-password"))!;
    await startAdminSession(user);
    await setAdminPassword(user.id, "irrelevant-hash", false); // bumps passwordVersion
    expect(await getCurrentAdmin()).toBeNull();
  });

  it("a disabled admin cannot keep a session", async () => {
    const sales = await createAdminUser({ name: "Sales Person", username: "salesperson", role: "sales" });
    await setAdminPassword(sales.id, "hash", false);
    await startAdminSession({ ...sales, passwordVersion: sales.passwordVersion + 1 });
    expect(await getCurrentAdmin()).not.toBeNull();
    const { updateAdminUser } = await import("./accounts-store");
    await updateAdminUser(sales.id, { active: false });
    expect(await getCurrentAdmin()).toBeNull();
  });
});

describe("requireAdminPermission (server actions: returns null, never redirects)", () => {
  it("returns the admin when their role has the permission", async () => {
    await startAdminSession(await readyMaster());
    const result = await requireAdminPermission("rates.manage");
    expect(result?.username).toBe("apatel");
  });

  it("returns null (not an error, not a redirect) when the role lacks the permission", async () => {
    const sales = await createAdminUser({ name: "Sales Person", username: "salesperson", role: "sales" });
    const hash = (await import("./passwords")).hashPassword;
    await setAdminPassword(sales.id, await hash("a-real-password-123"), false);
    const fresh = (await verifyAdminCredentials("salesperson", "a-real-password-123"))!.user;
    await startAdminSession(fresh);
    expect(await requireAdminPermission("rates.manage")).toBeNull();
    expect(await requireAdminPermission("inquiries.view")).not.toBeNull();
  });

  it("returns null with no session at all", async () => {
    expect(await requireAdminPermission("inquiries.view")).toBeNull();
  });
});

describe("requireAdminPage (server components: redirects instead of returning null)", () => {
  it("redirects to /admin with no session", async () => {
    await expect(requireAdminPage()).rejects.toMatchObject({ url: "/admin" });
  });

  it("redirects to /admin/inquiries when the role lacks the requested permission", async () => {
    const sales = await createAdminUser({ name: "Sales Person", username: "salesperson", role: "sales" });
    const hash = (await import("./passwords")).hashPassword;
    await setAdminPassword(sales.id, await hash("a-real-password-123"), false);
    const fresh = (await verifyAdminCredentials("salesperson", "a-real-password-123"))!.user;
    await startAdminSession(fresh);
    await expect(requireAdminPage("rates.manage")).rejects.toMatchObject({ url: "/admin/inquiries" });
  });

  it("returns the admin when everything checks out", async () => {
    await startAdminSession(await readyMaster());
    await expect(requireAdminPage("rates.manage")).resolves.toMatchObject({ username: "apatel" });
  });

  it("redirects to /admin/account when a temporary password still needs changing (allowAccountSetup not passed)", async () => {
    const { user } = (await verifyAdminCredentials("apatel", "bootstrap-password"))!; // mustChangePassword: true
    await startAdminSession(user);
    await expect(requireAdminPage()).rejects.toMatchObject({ url: "/admin/account" });
  });

  it("allowAccountSetup lets a must-change-password admin through to My account itself", async () => {
    const { user } = (await verifyAdminCredentials("apatel", "bootstrap-password"))!;
    await startAdminSession(user);
    await expect(requireAdminPage(undefined, { allowAccountSetup: true })).resolves.toMatchObject({ username: "apatel" });
  });
});

describe("two-step sign-in: the pending state between a correct password and the code", () => {
  it("getPendingTwoStepAdmin is null until startTwoStepSignIn, and only for an account with two-step on", async () => {
    const admin = await createAdminUser({ name: "Two Step", username: "twostep", role: "sales" });
    expect(await getPendingTwoStepAdmin()).toBeNull();
    await startTwoStepSignIn("admin", { id: admin.id, passwordVersion: admin.passwordVersion });
    // Not yet enabled for two-step, so the pending cookie resolves to nothing.
    expect(await getPendingTwoStepAdmin()).toBeNull();
  });

  it("resolves to the right account once two-step is actually enabled, and endTwoStepSignIn clears it", async () => {
    const admin = await createAdminUser({ name: "Two Step", username: "twostep2", role: "sales" });
    await setTwoStepPending("admin", admin.id, "encrypted-secret");
    const enabled = await enableTwoStep("admin", admin.id, "encrypted-secret", 1, ["hash1", "hash2"]);
    expect(enabled).toBe(true);
    const updated = (await import("./accounts-store")).getAdminUser;
    const withSecret = (await updated(admin.id))!;
    await startTwoStepSignIn("admin", { id: withSecret.id, passwordVersion: withSecret.passwordVersion });
    const pending = await getPendingTwoStepAdmin();
    expect(pending?.id).toBe(admin.id);
    await endTwoStepSignIn("admin");
    expect(await getPendingTwoStepAdmin()).toBeNull();
  });
});

describe("investor sign-in", () => {
  async function makeInvestor(username: string) {
    const investor = await createInvestor({
      name: "Jane Investor",
      username,
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
    const { hashPassword } = await import("./passwords");
    await setInvestorPassword(investor.id, await hashPassword("a-real-password-123"), false);
    return investor;
  }

  it("verifies a correct password and rejects a wrong one", async () => {
    await makeInvestor("janei");
    expect(await verifyInvestorCredentials("janei", "a-real-password-123")).not.toBeNull();
    expect(await verifyInvestorCredentials("janei", "wrong")).toBeNull();
  });

  it("rejects an investor with no password set yet", async () => {
    await createInvestor({
      name: "No Password",
      username: "nopass",
      email: "n@example.com",
      phone: "",
      sourceInquiryId: null,
      investment: {
        principal: 25_000,
        investmentDate: "2026-11-01",
        lockInYears: 1,
        frequency: "quarterly",
        payoutType: "interest-only",
        annualRatePercent: 8,
      },
    });
    expect(await verifyInvestorCredentials("nopass", "anything")).toBeNull();
  });

  it("round-trips a session: start -> getCurrentInvestor finds the same investor", async () => {
    const investor = await makeInvestor("janei2");
    const { investor: verified } = (await verifyInvestorCredentials("janei2", "a-real-password-123"))!;
    await startInvestorSession(verified);
    expect((await getCurrentInvestor())?.id).toBe(investor.id);
  });
});
