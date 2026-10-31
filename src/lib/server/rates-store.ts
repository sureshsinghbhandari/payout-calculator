import "server-only";
import { BlobError, BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { writableEtag } from "./blob-etag";
import { cacheLife, cacheTag } from "next/cache";
import {
  defaultStoredRates,
  nextStoredRates,
  parseStoredRates,
  type RateTable,
  type StoredRates,
} from "../rates";

export type { StoredRates } from "../rates";

/**
 * Earnings rates are stored as one private JSON file in Vercel Blob.
 * Private blobs need the server's token to read, so visitors cannot fetch them.
 */
// Production deployments share one rates file. Preview deployments and local
// development get their own file, so testing never changes the live rates.
const RATES_PATHNAME =
  process.env.VERCEL_ENV === "production"
    ? "config/interest-rates.json"
    : `config/${process.env.VERCEL_ENV || "local"}/interest-rates.json`;
const HISTORY_LIMIT = 20;
const SAVE_ATTEMPTS = 3;

/** Cache tag for the rates; saving rates expires it so new quotes use them at once. */
export const RATES_TAG = "interest-rates";

export function isRateStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

interface RawRead {
  /** Parsed rates, or null when there is no file or it could not be parsed. */
  stored: StoredRates | null;
  /** ETag of the current file, or null when there is no file. */
  etag: string | null;
  /** True when a file exists but its contents are not valid rates. */
  invalid: boolean;
}

async function readRaw(): Promise<RawRead> {
  if (!isRateStorageConfigured()) return { stored: null, etag: null, invalid: false };
  // Network and permission errors are thrown to the caller.
  const result = await get(RATES_PATHNAME, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return { stored: null, etag: null, invalid: false };
  const text = await new Response(result.stream).text();
  try {
    return { stored: parseStoredRates(text), etag: writableEtag(result.blob.etag), invalid: false };
  } catch (error) {
    console.error("Stored earnings rates could not be parsed", error);
    return { stored: null, etag: writableEtag(result.blob.etag), invalid: true };
  }
}

/**
 * Reads the latest saved rates directly from storage (no caching).
 * Throws when the stored file is invalid, so quotes are never calculated from bad data.
 */
export async function readStoredRates(): Promise<StoredRates> {
  const raw = await readRaw();
  if (raw.invalid) throw new Error("Stored earnings rates are invalid.");
  return raw.stored ?? defaultStoredRates();
}

/**
 * For the admin page: the saved rates, or the defaults plus `invalid: true`
 * when the stored file is unreadable, so the admin can save valid rates over it.
 */
export async function readStoredRatesForAdmin(): Promise<{ stored: StoredRates; invalid: boolean }> {
  const raw = await readRaw();
  return { stored: raw.stored ?? defaultStoredRates(), invalid: raw.invalid };
}

/**
 * Rates used for quotes. Cached across server instances and expired as soon
 * as an admin saves new rates.
 */
export async function getCurrentRates(): Promise<RateTable> {
  "use cache: remote";
  cacheTag(RATES_TAG);
  cacheLife("max");
  return (await readStoredRates()).rates;
}

function isWriteConflict(error: unknown): boolean {
  return (
    error instanceof BlobPreconditionFailedError ||
    (error instanceof BlobError && /already exists/i.test(error.message))
  );
}

/**
 * Saves new rates and records the change in the history. Uses the file's ETag
 * so two saves at the same moment cannot overwrite each other's history; on a
 * conflict it re-reads and tries again. An unreadable file is replaced.
 */
export async function saveRates(rates: RateTable, savedAt: string): Promise<StoredRates> {
  for (let attempt = 1; attempt <= SAVE_ATTEMPTS; attempt++) {
    const raw = await readRaw();
    const next = nextStoredRates(raw.stored ?? defaultStoredRates(), rates, savedAt, HISTORY_LIMIT);
    try {
      await put(RATES_PATHNAME, JSON.stringify(next, null, 2), {
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
  throw new Error("Saving rates failed.");
}
