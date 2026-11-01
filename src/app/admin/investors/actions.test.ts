import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeInquiryId, type StoredInquiry } from "@/lib/inquiry";
import type { ConvertField, PlanField } from "@/components/admin/investors/fields";

/**
 * A fake in-memory private Vercel Blob store with ETag checks, shared by
 * every path this test file reads or writes (inquiries, admin-users.json,
 * investors.json, earnings rates, amounts and terms, audit events). Same
 * shape and behaviour as auth.test.ts's and rates-store.test.ts's fakes.
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
    async del(pathname: string) {
      files.delete(pathname);
    },
    async list({ prefix }: { prefix?: string } = {}) {
      const matched = [...files.keys()].filter((p) => !prefix || p.startsWith(prefix)).map((pathname) => ({ pathname }));
      return { blobs: matched, hasMore: false, cursor: undefined as string | undefined };
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
  del: blobs.del,
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

vi.mock("next/headers", () => ({ cookies: async () => cookieJar, headers: async () => new Headers() }));

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

// The rates and amounts-and-terms stores read with "use cache: remote"
// (cacheTag/cacheLife); server actions call refresh()/updateTag() after a
// save. None of that caching exists under Vitest, so these are all no-ops.
vi.mock("next/cache", () => ({ refresh: () => {}, updateTag: () => {}, cacheLife: () => {}, cacheTag: () => {} }));

// recordAudit schedules its write with next/server's after(). Outside a real
// request there is nothing to defer to; run it right away instead (mirroring
// what recordAudit itself falls back to when after() throws).
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));

const { convertInquiryAction, addInvestmentAction } = await import("./actions");
const { createAdminUser, createInvestor, getInvestor, findInvestorByUsername, setAdminPassword } = await import(
  "@/lib/server/accounts-store"
);
const { verifyAdminCredentials, startAdminSession } = await import("@/lib/server/auth");
const { hashPassword } = await import("@/lib/server/passwords");
const { saveInquiry, getInquiry } = await import("@/lib/server/inquiry-store");
const { saveRates } = await import("@/lib/server/rates-store");

process.env.BLOB_READ_WRITE_TOKEN = "test-token";
process.env.ADMIN_SESSION_SECRET = "s".repeat(32);
process.env.ADMIN_PASSWORD = "bootstrap-password";
delete process.env.VERCEL_ENV;

const NO_ACCESS = "Your session has ended or you do not have permission for this. Sign in again as a Master Admin.";

beforeEach(() => {
  blobs.reset();
  cookieJar.reset();
});

/** Creates an admin with a real password and starts their session; returns the signed-in user. */
async function signInAdmin(role: "master" | "sales", username: string) {
  const admin = await createAdminUser({ name: "Test Admin", username, role });
  await setAdminPassword(admin.id, await hashPassword("a-real-password-123"), false);
  const fresh = (await verifyAdminCredentials(username, "a-real-password-123"))!.user;
  await startAdminSession(fresh);
  return fresh;
}

let inquirySeq = 0;

/** A "contacted" inquiry ready to convert, with a fresh id each time it is called. */
function makeContactedInquiry(overrides: Partial<StoredInquiry> = {}): StoredInquiry {
  inquirySeq += 1;
  const hex = inquirySeq.toString(16).padStart(8, "0");
  return {
    id: makeInquiryId(new Date("2026-10-01T12:00:00.000Z"), hex),
    createdAt: "2026-10-01T12:00:00.000Z",
    status: "contacted",
    name: "Jordan Lee",
    email: "jordan@example.com",
    phone: "",
    message: "",
    howFound: "other",
    webinarDetails: "",
    referrerContact: "",
    plan: {
      principal: 50_000,
      lockInYears: 2,
      frequency: "yearly",
      payoutType: "interest-only",
      investmentDate: "2026-11-01",
      startDate: "2026-11-02",
      annualRatePercent: 9,
      totalInterestCents: 9_000_00,
      totalPaidCents: 59_000_00,
    },
    source: "website",
    ...overrides,
  };
}

function convertFormData(inquiryId: string, overrides: Partial<Record<ConvertField, string>> = {}): FormData {
  const values: Record<ConvertField, string> = {
    name: "Jordan Lee",
    email: "jordan@example.com",
    phone: "",
    username: "jordanlee",
    principal: "50000",
    investmentDate: "2026-11-01",
    lockInYears: "2",
    frequency: "yearly",
    payoutType: "interest-only",
    ...overrides,
  };
  const fd = new FormData();
  fd.set("inquiryId", inquiryId);
  for (const [key, value] of Object.entries(values)) fd.set(key, value);
  return fd;
}

function planFormData(id: string, overrides: Partial<Record<PlanField, string>> = {}, renewedFromId: string | null = null): FormData {
  const values: Record<PlanField, string> = {
    principal: "50000",
    investmentDate: "2026-11-01",
    lockInYears: "2",
    frequency: "yearly",
    payoutType: "interest-only",
    ...overrides,
  };
  const fd = new FormData();
  fd.set("id", id);
  if (renewedFromId) fd.set("renewedFromId", renewedFromId);
  for (const [key, value] of Object.entries(values)) fd.set(key, value);
  return fd;
}

/** An investor with one investment, for the add-investment / renewal tests. */
async function makeTestInvestor(
  username: string,
  investment: { investmentDate: string; lockInYears: number; frequency: "quarterly" | "half-yearly" | "yearly" },
) {
  return createInvestor({
    name: "Existing Investor",
    username,
    email: `${username}@example.com`,
    phone: "",
    sourceInquiryId: null,
    investment: { principal: 50_000, payoutType: "interest-only", annualRatePercent: 9, ...investment },
  });
}

describe("convertInquiryAction", () => {
  it("refuses a Sales Admin, who lacks inquiries.convert", async () => {
    await signInAdmin("sales", "salesperson1");
    const inquiry = makeContactedInquiry();
    await saveInquiry(inquiry);

    const result = await convertInquiryAction({}, convertFormData(inquiry.id));
    expect(result.error).toBe(NO_ACCESS);
    expect(await findInvestorByUsername("jordanlee")).toBeNull();
    expect((await getInquiry(inquiry.id))?.status).toBe("contacted");
  });

  it("converts a contacted inquiry into an investor for a Master Admin, fixing the rate at conversion time", async () => {
    await saveRates({ quarterly: 8, "half-yearly": 9, yearly: 12 }, "2026-10-01T00:00:00.000Z");
    await signInAdmin("master", "masteradmin1");
    const inquiry = makeContactedInquiry();
    await saveInquiry(inquiry);

    const fd = convertFormData(inquiry.id, { username: "newinvestor1", frequency: "yearly" });
    await expect(convertInquiryAction({}, fd)).rejects.toMatchObject({
      url: expect.stringMatching(/^\/admin\/investors\/inv_[0-9a-f]+\?created=1$/),
    });

    const investor = await findInvestorByUsername("newinvestor1");
    expect(investor).not.toBeNull();
    expect(investor!.sourceInquiryId).toBe(inquiry.id);
    expect(investor!.investments).toHaveLength(1);
    expect(investor!.investments[0].annualRatePercent).toBe(12);

    const updatedInquiry = await getInquiry(inquiry.id);
    expect(updatedInquiry?.status).toBe("converted");
    expect(updatedInquiry?.investorId).toBe(investor!.id);

    // The rate was fixed on the investment at conversion time, not recalculated later.
    await saveRates({ quarterly: 8, "half-yearly": 9, yearly: 20 }, "2026-10-02T00:00:00.000Z");
    const reread = await getInvestor(investor!.id);
    expect(reread?.investments[0].annualRatePercent).toBe(12);
  });

  it("refuses to convert an inquiry that is not contacted (new)", async () => {
    await signInAdmin("master", "masteradmin2");
    const inquiry = makeContactedInquiry({ status: "new" });
    await saveInquiry(inquiry);

    const result = await convertInquiryAction({}, convertFormData(inquiry.id));
    expect(result.error).toBe("Only inquiries marked as contacted can be converted.");
    expect(await findInvestorByUsername("jordanlee")).toBeNull();
  });

  it("refuses to convert a deleted inquiry", async () => {
    await signInAdmin("master", "masteradmin3");
    const inquiry = makeContactedInquiry({
      status: "deleted",
      statusBeforeDelete: "contacted",
      deletedAt: "2026-10-05T00:00:00.000Z",
    });
    await saveInquiry(inquiry);

    const result = await convertInquiryAction({}, convertFormData(inquiry.id));
    expect(result.error).toBe("Only inquiries marked as contacted can be converted.");
  });

  it("refuses to convert an inquiry that was already converted", async () => {
    await signInAdmin("master", "masteradmin4");
    const inquiry = makeContactedInquiry({
      status: "converted",
      investorId: "inv_existing",
      convertedAt: "2026-10-05T00:00:00.000Z",
    });
    await saveInquiry(inquiry);

    const result = await convertInquiryAction({}, convertFormData(inquiry.id));
    expect(result.error).toBe("This inquiry has already been converted to an investor.");
  });

  it("refuses a duplicate username (AccountError from createInvestor)", async () => {
    await signInAdmin("master", "masteradmin5");
    await createInvestor({
      name: "Taken",
      username: "taken",
      email: "taken@example.com",
      phone: "",
      sourceInquiryId: null,
      investment: {
        principal: 50_000,
        investmentDate: "2026-01-01",
        lockInYears: 1,
        frequency: "yearly",
        payoutType: "interest-only",
        annualRatePercent: 9,
      },
    });
    const inquiry = makeContactedInquiry();
    await saveInquiry(inquiry);

    const result = await convertInquiryAction({}, convertFormData(inquiry.id, { username: "taken" }));
    expect(result.error).toBe("That username is already taken.");
    expect(result.fieldErrors?.username).toBe("That username is already taken.");
    // The inquiry is untouched: it can still be converted once a free username is chosen.
    expect((await getInquiry(inquiry.id))?.status).toBe("contacted");
  });

  it("refuses to convert an inquiry once its sourceInquiryId has already been used by another investor", async () => {
    await signInAdmin("master", "masteradmin6");
    const inquiry = makeContactedInquiry();
    await saveInquiry(inquiry);
    // Simulates a previous conversion whose investor was created but whose
    // own status update never landed (the inquiry is still "contacted").
    await createInvestor({
      name: "Already Converted",
      username: "alreadyconverted",
      email: "a@example.com",
      phone: "",
      sourceInquiryId: inquiry.id,
      investment: {
        principal: 50_000,
        investmentDate: "2026-01-01",
        lockInYears: 1,
        frequency: "yearly",
        payoutType: "interest-only",
        annualRatePercent: 9,
      },
    });

    const result = await convertInquiryAction({}, convertFormData(inquiry.id, { username: "secondattempt" }));
    expect(result.error).toBe("This inquiry has already been converted.");
    expect(result.fieldErrors).toBeUndefined();
    expect(await findInvestorByUsername("secondattempt")).toBeNull();
  });
});

describe("addInvestmentAction", () => {
  it("refuses a Sales Admin, who lacks investors.manage", async () => {
    await signInAdmin("sales", "salesperson2");
    const investor = await makeTestInvestor("investorperm1", { investmentDate: "2023-01-01", lockInYears: 1, frequency: "yearly" });

    const result = await addInvestmentAction({}, planFormData(investor.id));
    expect(result.error).toBe(NO_ACCESS);
    expect((await getInvestor(investor.id))?.investments).toHaveLength(1);
  });

  it("adds a new investment for a Master Admin, with the rate fixed at the current rate", async () => {
    await saveRates({ quarterly: 11, "half-yearly": 9, yearly: 10 }, "2026-10-01T00:00:00.000Z");
    await signInAdmin("master", "masterinv1");
    const investor = await makeTestInvestor("investoradd1", { investmentDate: "2023-01-01", lockInYears: 1, frequency: "yearly" });

    const fd = planFormData(investor.id, { frequency: "quarterly", principal: "25000", lockInYears: "1" });
    await expect(addInvestmentAction({}, fd)).rejects.toMatchObject({ url: `/admin/investors/${investor.id}?added=1` });

    const updated = await getInvestor(investor.id);
    expect(updated?.investments).toHaveLength(2);
    const added = updated!.investments.find((i) => i.id !== investor.investments[0].id)!;
    expect(added.annualRatePercent).toBe(11);
    expect(added.renewedFromId).toBeNull();

    // Changing the rate afterwards does not touch the investment already added.
    await saveRates({ quarterly: 30, "half-yearly": 9, yearly: 10 }, "2026-10-02T00:00:00.000Z");
    const reread = await getInvestor(investor.id);
    expect(reread?.investments.find((i) => i.id === added.id)?.annualRatePercent).toBe(11);
  });

  it("renews a matured investment, fixing the new rate and linking renewedFromId", async () => {
    await saveRates({ quarterly: 8, "half-yearly": 9, yearly: 14 }, "2026-10-01T00:00:00.000Z");
    await signInAdmin("master", "masterinv2");
    const investor = await makeTestInvestor("investorrenew1", { investmentDate: "2023-01-01", lockInYears: 1, frequency: "yearly" });
    const source = investor.investments[0];

    const fd = planFormData(investor.id, { frequency: "yearly" }, source.id);
    await expect(addInvestmentAction({}, fd)).rejects.toMatchObject({ url: `/admin/investors/${investor.id}?renewed=1` });

    const updated = await getInvestor(investor.id);
    const renewal = updated!.investments.find((i) => i.renewedFromId === source.id);
    expect(renewal).toBeDefined();
    expect(renewal!.annualRatePercent).toBe(14);
  });

  it("refuses to renew an investment whose term has not ended", async () => {
    await signInAdmin("master", "masterinv3");
    const investor = await makeTestInvestor("investornotmatured", { investmentDate: "2026-10-01", lockInYears: 2, frequency: "yearly" });
    const source = investor.investments[0];

    const result = await addInvestmentAction({}, planFormData(investor.id, {}, source.id));
    expect(result.error).toBe("Only an investment whose term has ended can be renewed.");
    expect((await getInvestor(investor.id))?.investments).toHaveLength(1);
  });

  it("refuses to renew an investment that has already been renewed", async () => {
    await signInAdmin("master", "masterinv4");
    const investor = await makeTestInvestor("investordoublerenew", { investmentDate: "2023-01-01", lockInYears: 1, frequency: "yearly" });
    const source = investor.investments[0];

    await expect(addInvestmentAction({}, planFormData(investor.id, { frequency: "yearly" }, source.id))).rejects.toMatchObject({
      url: `/admin/investors/${investor.id}?renewed=1`,
    });

    const result = await addInvestmentAction({}, planFormData(investor.id, { frequency: "yearly" }, source.id));
    expect(result.error).toBe("This investment has already been renewed.");
    expect((await getInvestor(investor.id))?.investments).toHaveLength(2);
  });

  it("returns a not-found error for an investor id that does not exist", async () => {
    await signInAdmin("master", "masterinv5");
    const result = await addInvestmentAction({}, planFormData("inv_doesnotexist"));
    expect(result.error).toBe("This investor could not be found. Reload the page.");
  });
});
