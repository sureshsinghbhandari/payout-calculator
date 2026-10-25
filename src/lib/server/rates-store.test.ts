import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in for the private Vercel Blob store, with ETag checks.
const blobs = vi.hoisted(() => {
  class FakeBlobError extends Error {}
  class FakePreconditionFailed extends FakeBlobError {}
  const files = new Map<string, { text: string; etag: string }>();
  let version = 0;
  let readDelayMs = 0;
  return {
    files,
    setReadDelay: (ms: number) => {
      readDelayMs = ms;
    },
    reset: () => {
      files.clear();
      version = 0;
      readDelayMs = 0;
    },
    async get(pathname: string) {
      if (readDelayMs) await new Promise((r) => setTimeout(r, readDelayMs));
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
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("@vercel/blob", () => {
  class BlobError extends Error {}
  class BlobPreconditionFailedError extends BlobError {}
  return {
    BlobError,
    BlobPreconditionFailedError,
    get: (pathname: string) => blobs.get(pathname),
    put: async (pathname: string, body: string, options: { allowOverwrite?: boolean; ifMatch?: string }) => {
      try {
        return await blobs.put(pathname, body, options);
      } catch (error) {
        const message = (error as Error).message;
        throw message === "This blob already exists" ? new BlobError(message) : new BlobPreconditionFailedError();
      }
    },
  };
});

process.env.BLOB_READ_WRITE_TOKEN = "test-token";
delete process.env.VERCEL_ENV;

const store = await import("./rates-store");
const LOCAL_PATH = "config/local/interest-rates.json";

beforeEach(() => blobs.reset());

describe("rates store", () => {
  it("uses the default rates until something is saved", async () => {
    expect((await store.readStoredRates()).rates).toEqual({ quarterly: 8, "half-yearly": 9, yearly: 10 });
    expect(await store.getCurrentRates()).toEqual({ quarterly: 8, "half-yearly": 9, yearly: 10 });
  });

  it("saves to a non-production file outside production", async () => {
    await store.saveRates({ quarterly: 7, "half-yearly": 8, yearly: 9 }, "2026-10-25T10:00:00.000Z");
    expect([...blobs.files.keys()]).toEqual([LOCAL_PATH]);
    expect((await store.readStoredRates()).rates).toEqual({ quarterly: 7, "half-yearly": 8, yearly: 9 });
  });

  it("keeps both entries when two saves happen at the same moment", async () => {
    await store.saveRates({ quarterly: 8, "half-yearly": 9, yearly: 10 }, "2026-10-01T00:00:00.000Z");
    blobs.setReadDelay(30);
    await Promise.all([
      store.saveRates({ quarterly: 7.5, "half-yearly": 9, yearly: 10 }, "2026-10-25T10:00:00.001Z"),
      store.saveRates({ quarterly: 8, "half-yearly": 9, yearly: 11 }, "2026-10-25T10:00:00.002Z"),
    ]);
    blobs.setReadDelay(0);
    const stored = await store.readStoredRates();
    expect(stored.history.map((h) => h.savedAt).sort()).toEqual([
      "2026-10-01T00:00:00.000Z",
      "2026-10-25T10:00:00.001Z",
      "2026-10-25T10:00:00.002Z",
    ]);
  });

  it("refuses to quote from an unreadable file but lets the admin replace it", async () => {
    blobs.files.set(LOCAL_PATH, { text: '{"rates":{"quarterly":8}}', etag: '"bad"' });
    await expect(store.readStoredRates()).rejects.toThrow("invalid");
    await expect(store.getCurrentRates()).rejects.toThrow();

    const admin = await store.readStoredRatesForAdmin();
    expect(admin.invalid).toBe(true);
    expect(admin.stored.rates).toEqual({ quarterly: 8, "half-yearly": 9, yearly: 10 });

    await store.saveRates({ quarterly: 8, "half-yearly": 9, yearly: 10 }, "2026-10-25T10:00:00.000Z");
    expect((await store.readStoredRatesForAdmin()).invalid).toBe(false);
    expect((await store.readStoredRates()).history).toHaveLength(1);
  });
});
