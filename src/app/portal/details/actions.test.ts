import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Same fake in-memory private Vercel Blob store (ETag-checked) used by
 * src/lib/server/auth.test.ts and src/app/portal/actions.test.ts, shared here
 * by every path this test file reads or writes (investors.json, and the
 * audit log change/privacy requests write to on success).
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

const {
  requestContactChangeAction,
  requestBankChangeAction,
  withdrawChangeRequestAction,
  requestPrivacyAction,
  withdrawPrivacyRequestAction,
} = await import("./actions");
const { createInvestor, getInvestor } = await import("@/lib/server/accounts-store");
const { startInvestorSession } = await import("@/lib/server/auth");
const { hashPassword } = await import("@/lib/server/passwords");

process.env.BLOB_READ_WRITE_TOKEN = "test-token";
process.env.ADMIN_SESSION_SECRET = "s".repeat(32);
process.env.ADMIN_PASSWORD = "bootstrap-password";
delete process.env.VERCEL_ENV;

beforeEach(() => {
  blobs.reset();
  cookieJar.reset();
});

let investorCounter = 0;

/** A fresh investor with a real (non-temporary) password, signed in by default. */
async function makeSignedInInvestor() {
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
  const { setInvestorPassword } = await import("@/lib/server/accounts-store");
  const withPassword = await setInvestorPassword(investor.id, await hashPassword("a-real-password-123"), false);
  await startInvestorSession(withPassword);
  return withPassword;
}

function contactForm(email: string, phone: string): FormData {
  const form = new FormData();
  form.set("email", email);
  form.set("phone", phone);
  return form;
}

function bankForm(accountHolder: string, bankName: string, routingCode: string, accountNumber: string): FormData {
  const form = new FormData();
  form.set("accountHolder", accountHolder);
  form.set("bankName", bankName);
  form.set("routingCode", routingCode);
  form.set("accountNumber", accountNumber);
  return form;
}

function withdrawForm(requestId: string): FormData {
  const form = new FormData();
  form.set("requestId", requestId);
  return form;
}

function privacyForm(kind: string, note = ""): FormData {
  const form = new FormData();
  form.set("kind", kind);
  form.set("note", note);
  return form;
}

describe("requestContactChangeAction", () => {
  it("refuses with no session at all", async () => {
    const result = await requestContactChangeAction({}, contactForm("new@example.com", "+1 555 000 1111"));
    expect(result.status).toBe("error");
    expect(result.message).toBe("Your session has ended. Sign in again.");
  });

  it("creates a pending change request for a valid, different contact", async () => {
    const investor = await makeSignedInInvestor();
    await expect(
      requestContactChangeAction({}, contactForm("new@example.com", "+1 555 000 1111")),
    ).rejects.toMatchObject({ url: "/portal/details?sent=contact" });

    const updated = (await getInvestor(investor.id))!;
    expect(updated.changeRequests).toHaveLength(1);
    expect(updated.changeRequests[0]).toMatchObject({
      kind: "contact",
      status: "pending",
      contact: { email: "new@example.com", phone: "+1 555 000 1111" },
    });
  });

  it("refuses an invalid email before anything is saved", async () => {
    await makeSignedInInvestor();
    const result = await requestContactChangeAction({}, contactForm("not-an-email", ""));
    expect(result.status).toBe("error");
    expect(result.fieldErrors?.email).toBeDefined();
  });

  it("refuses a second pending contact request while one is already pending", async () => {
    const investor = await makeSignedInInvestor();
    await expect(
      requestContactChangeAction({}, contactForm("new@example.com", "")),
    ).rejects.toMatchObject({ url: "/portal/details?sent=contact" });

    const result = await requestContactChangeAction({}, contactForm("another@example.com", ""));
    expect(result.status).toBe("error");
    expect(result.message).toMatch(/already have a change to your contact details waiting for review/);

    // Still only the first request.
    const updated = (await getInvestor(investor.id))!;
    expect(updated.changeRequests).toHaveLength(1);
    expect(updated.changeRequests[0].contact?.email).toBe("new@example.com");
  });
});

describe("requestBankChangeAction", () => {
  it("refuses with no session at all", async () => {
    const result = await requestBankChangeAction({}, bankForm("Jane Investor", "First Bank", "ABCD1234", "1234567890"));
    expect(result.status).toBe("error");
    expect(result.message).toBe("Your session has ended. Sign in again.");
  });

  it("creates a pending bank change request, storing only the last 4 digits in plain text", async () => {
    const investor = await makeSignedInInvestor();
    await expect(
      requestBankChangeAction({}, bankForm("Jane Investor", "First Bank", "ABCD1234", "1234567890")),
    ).rejects.toMatchObject({ url: "/portal/details?sent=bank" });

    const updated = (await getInvestor(investor.id))!;
    expect(updated.changeRequests).toHaveLength(1);
    const request = updated.changeRequests[0];
    expect(request.kind).toBe("bank");
    expect(request.bank?.accountLast4).toBe("7890");
    expect(request.bank?.encrypted).not.toBeNull();
    expect(request.bank?.encrypted).not.toContain("1234567890");
  });

  it("refuses an invalid account number before anything is saved", async () => {
    await makeSignedInInvestor();
    const result = await requestBankChangeAction({}, bankForm("Jane Investor", "First Bank", "ABCD1234", "ab"));
    expect(result.status).toBe("error");
    expect(result.fieldErrors?.accountNumber).toBeDefined();
  });

  it("refuses a second pending bank request while one is already pending", async () => {
    await makeSignedInInvestor();
    await expect(
      requestBankChangeAction({}, bankForm("Jane Investor", "First Bank", "ABCD1234", "1111222233")),
    ).rejects.toMatchObject({ url: "/portal/details?sent=bank" });

    const result = await requestBankChangeAction({}, bankForm("Jane Investor", "Second Bank", "WXYZ5678", "9999888877"));
    expect(result.status).toBe("error");
    expect(result.message).toMatch(/already have a change to your bank details waiting for review/);
  });

  it("a pending contact request and a pending bank request do not conflict with each other", async () => {
    const investor = await makeSignedInInvestor();
    await expect(requestContactChangeAction({}, contactForm("new@example.com", ""))).rejects.toMatchObject({
      url: "/portal/details?sent=contact",
    });
    await expect(
      requestBankChangeAction({}, bankForm("Jane Investor", "First Bank", "ABCD1234", "1234567890")),
    ).rejects.toMatchObject({ url: "/portal/details?sent=bank" });

    const updated = (await getInvestor(investor.id))!;
    expect(updated.changeRequests).toHaveLength(2);
  });
});

describe("withdrawChangeRequestAction", () => {
  it("refuses with no session at all", async () => {
    const result = await withdrawChangeRequestAction({}, withdrawForm("chg_whatever"));
    expect(result.status).toBe("error");
    expect(result.message).toBe("Your session has ended. Sign in again.");
  });

  it("refuses a request id that does not belong to the signed-in investor", async () => {
    const other = await makeSignedInInvestor();
    await expect(requestContactChangeAction({}, contactForm("other@example.com", ""))).rejects.toMatchObject({
      url: "/portal/details?sent=contact",
    });
    const othersRequestId = (await getInvestor(other.id))!.changeRequests[0].id;

    // A different investor signs in; the session cookie now points at them, not `other`.
    await makeSignedInInvestor();
    const result = await withdrawChangeRequestAction({}, withdrawForm(othersRequestId));
    expect(result.status).toBe("error");
    expect(result.message).toBe("This request could not be found. Reload the page.");
    // The other investor's request is untouched.
    expect((await getInvestor(other.id))!.changeRequests[0].status).toBe("pending");
  });

  it("withdraws a pending request of your own, freeing up a new request of the same kind", async () => {
    const investor = await makeSignedInInvestor();
    await expect(requestContactChangeAction({}, contactForm("new@example.com", ""))).rejects.toMatchObject({
      url: "/portal/details?sent=contact",
    });
    const requestId = (await getInvestor(investor.id))!.changeRequests[0].id;

    await expect(withdrawChangeRequestAction({}, withdrawForm(requestId))).rejects.toMatchObject({
      url: "/portal/details?withdrawn=1",
    });
    const afterWithdraw = (await getInvestor(investor.id))!;
    expect(afterWithdraw.changeRequests[0].status).toBe("withdrawn");

    // A new request of the same kind is now accepted.
    await expect(requestContactChangeAction({}, contactForm("another@example.com", ""))).rejects.toMatchObject({
      url: "/portal/details?sent=contact",
    });
    const afterSecond = (await getInvestor(investor.id))!;
    expect(afterSecond.changeRequests.filter((r) => r.status === "pending")).toHaveLength(1);
  });
});

describe("requestPrivacyAction", () => {
  it("refuses with no session at all", async () => {
    const result = await requestPrivacyAction({}, privacyForm("copy"));
    expect(result.status).toBe("error");
    expect(result.message).toBe("Your session has ended. Sign in again.");
  });

  it("creates a pending privacy request", async () => {
    const investor = await makeSignedInInvestor();
    await expect(requestPrivacyAction({}, privacyForm("copy", "Please send a copy of my records."))).rejects.toMatchObject({
      url: "/portal/details?sent=privacy-copy",
    });
    const updated = (await getInvestor(investor.id))!;
    expect(updated.privacyRequests).toHaveLength(1);
    expect(updated.privacyRequests[0]).toMatchObject({
      kind: "copy",
      status: "pending",
      note: "Please send a copy of my records.",
    });
  });

  it("refuses an unknown request kind", async () => {
    await makeSignedInInvestor();
    const result = await requestPrivacyAction({}, privacyForm("not-a-kind"));
    expect(result.status).toBe("error");
    expect(result.message).toBe("This request could not be found. Reload the page.");
  });

  it("refuses a second pending privacy request of the same kind while one is already pending", async () => {
    await makeSignedInInvestor();
    await expect(requestPrivacyAction({}, privacyForm("deletion"))).rejects.toMatchObject({
      url: "/portal/details?sent=privacy-deletion",
    });
    const result = await requestPrivacyAction({}, privacyForm("deletion"));
    expect(result.status).toBe("error");
    expect(result.message).toMatch(/already have a request to delete your account waiting for review/);
  });

  it("a pending copy request and a pending deletion request do not conflict with each other", async () => {
    const investor = await makeSignedInInvestor();
    await expect(requestPrivacyAction({}, privacyForm("copy"))).rejects.toMatchObject({
      url: "/portal/details?sent=privacy-copy",
    });
    await expect(requestPrivacyAction({}, privacyForm("deletion"))).rejects.toMatchObject({
      url: "/portal/details?sent=privacy-deletion",
    });
    const updated = (await getInvestor(investor.id))!;
    expect(updated.privacyRequests).toHaveLength(2);
  });
});

describe("withdrawPrivacyRequestAction", () => {
  it("refuses with no session at all", async () => {
    const result = await withdrawPrivacyRequestAction({}, withdrawForm("prv_whatever"));
    expect(result.status).toBe("error");
    expect(result.message).toBe("Your session has ended. Sign in again.");
  });

  it("refuses a request id that does not belong to the signed-in investor", async () => {
    const other = await makeSignedInInvestor();
    await expect(requestPrivacyAction({}, privacyForm("copy"))).rejects.toMatchObject({
      url: "/portal/details?sent=privacy-copy",
    });
    const othersRequestId = (await getInvestor(other.id))!.privacyRequests[0].id;

    await makeSignedInInvestor();
    const result = await withdrawPrivacyRequestAction({}, withdrawForm(othersRequestId));
    expect(result.status).toBe("error");
    expect(result.message).toBe("This request could not be found. Reload the page.");
    expect((await getInvestor(other.id))!.privacyRequests[0].status).toBe("pending");
  });

  it("withdraws a pending privacy request of your own, freeing up a new one of the same kind", async () => {
    const investor = await makeSignedInInvestor();
    await expect(requestPrivacyAction({}, privacyForm("copy"))).rejects.toMatchObject({
      url: "/portal/details?sent=privacy-copy",
    });
    const requestId = (await getInvestor(investor.id))!.privacyRequests[0].id;

    await expect(withdrawPrivacyRequestAction({}, withdrawForm(requestId))).rejects.toMatchObject({
      url: "/portal/details?withdrawn=privacy",
    });
    expect((await getInvestor(investor.id))!.privacyRequests[0].status).toBe("withdrawn");

    await expect(requestPrivacyAction({}, privacyForm("copy"))).rejects.toMatchObject({
      url: "/portal/details?sent=privacy-copy",
    });
    const afterSecond = (await getInvestor(investor.id))!;
    expect(afterSecond.privacyRequests.filter((r) => r.status === "pending")).toHaveLength(1);
  });
});
