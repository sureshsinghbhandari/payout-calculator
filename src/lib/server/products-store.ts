import "server-only";
import { BlobError, BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { cacheLife, cacheTag } from "next/cache";
import {
  defaultStoredProducts,
  nextStoredProducts,
  parseStoredProducts,
  type ProductSettings,
  type StoredProducts,
} from "../products";
import { writableEtag } from "./blob-etag";

export type { ProductSettings, StoredProducts } from "../products";

/**
 * The amounts, terms and payout terms on offer are stored as one private JSON
 * file in Vercel Blob, next to the earnings rates.
 */
// Production deployments share one file. Preview deployments and local
// development get their own file, so testing never changes what is offered live.
const PRODUCTS_PATHNAME =
  process.env.VERCEL_ENV === "production"
    ? "config/amounts-and-terms.json"
    : `config/${process.env.VERCEL_ENV || "local"}/amounts-and-terms.json`;
const HISTORY_LIMIT = 20;
const SAVE_ATTEMPTS = 3;

/** Cache tag for the settings; saving expires it so the calculator and forms use them at once. */
export const PRODUCTS_TAG = "amounts-and-terms";

export function isProductStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

interface RawRead {
  /** Parsed settings, or null when there is no file or it could not be parsed. */
  stored: StoredProducts | null;
  /** ETag of the current file, or null when there is no file. */
  etag: string | null;
  /** True when a file exists but its contents are not valid settings. */
  invalid: boolean;
}

async function readRaw(): Promise<RawRead> {
  if (!isProductStorageConfigured()) return { stored: null, etag: null, invalid: false };
  // Network and permission errors are thrown to the caller.
  const result = await get(PRODUCTS_PATHNAME, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return { stored: null, etag: null, invalid: false };
  const text = await new Response(result.stream).text();
  try {
    return { stored: parseStoredProducts(text), etag: writableEtag(result.blob.etag), invalid: false };
  } catch (error) {
    console.error("Stored amounts and terms could not be parsed", error);
    return { stored: null, etag: writableEtag(result.blob.etag), invalid: true };
  }
}

/**
 * Reads the latest saved settings directly from storage (no caching).
 * Throws when the stored file is invalid, so nothing is offered from bad data.
 */
export async function readStoredProducts(): Promise<StoredProducts> {
  const raw = await readRaw();
  if (raw.invalid) throw new Error("Stored amounts and terms are invalid.");
  return raw.stored ?? defaultStoredProducts();
}

/**
 * For the settings page: the saved settings, or the defaults plus `invalid: true`
 * when the stored file is unreadable, so the admin can save valid settings over it.
 */
export async function readStoredProductsForAdmin(): Promise<{ stored: StoredProducts; invalid: boolean }> {
  const raw = await readRaw();
  return { stored: raw.stored ?? defaultStoredProducts(), invalid: raw.invalid };
}

/**
 * The amounts and terms on offer. Cached across server instances and expired
 * as soon as an admin saves new settings.
 */
export async function getCurrentProducts(): Promise<ProductSettings> {
  "use cache: remote";
  cacheTag(PRODUCTS_TAG);
  cacheLife("max");
  return (await readStoredProducts()).settings;
}

function isWriteConflict(error: unknown): boolean {
  return (
    error instanceof BlobPreconditionFailedError ||
    (error instanceof BlobError && /already exists/i.test(error.message))
  );
}

/**
 * Saves new settings and records them in the history. Uses the file's ETag so
 * two saves at the same moment cannot overwrite each other's history; on a
 * conflict it re-reads and tries again. An unreadable file is replaced.
 */
export async function saveProducts(settings: ProductSettings, savedAt: string): Promise<StoredProducts> {
  for (let attempt = 1; attempt <= SAVE_ATTEMPTS; attempt++) {
    const raw = await readRaw();
    const next = nextStoredProducts(raw.stored ?? defaultStoredProducts(), settings, savedAt, HISTORY_LIMIT);
    try {
      await put(PRODUCTS_PATHNAME, JSON.stringify(next, null, 2), {
        access: "private",
        addRandomSuffix: false,
        contentType: "application/json",
        cacheControlMaxAge: 60,
        // Overwrite only the version we read; create only if there is none yet.
        ...(raw.etag ? { allowOverwrite: true, ifMatch: raw.etag } : { allowOverwrite: false }),
      });
      return next;
    } catch (error) {
      if (!isWriteConflict(error) || attempt === SAVE_ATTEMPTS) throw error;
    }
  }
  throw new Error("Saving amounts and terms failed.");
}
