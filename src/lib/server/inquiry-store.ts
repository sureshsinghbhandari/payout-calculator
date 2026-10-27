import "server-only";
import { del, get, list, put } from "@vercel/blob";
import { isInquiryId, parseStoredInquiry, type ActiveInquiryStatus, type StoredInquiry } from "../inquiry";

/**
 * Inquiries are stored as one private JSON file each in Vercel Blob, so two
 * visitors sending at the same moment never conflict. Production uses its own
 * folder; preview deployments and local development use separate folders.
 */
const PREFIX = `inquiries/${process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_ENV || "local"}/`;

/** How many of the newest inquiries the admin page loads. */
export const INQUIRY_LIST_LIMIT = 200;

export function isInquiryStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

function pathnameFor(id: string): string {
  // Ids are validated before they are turned into paths.
  if (!isInquiryId(id)) throw new Error("Invalid inquiry id.");
  return `${PREFIX}${id}.json`;
}

export async function saveInquiry(inquiry: StoredInquiry): Promise<void> {
  await put(pathnameFor(inquiry.id), JSON.stringify(inquiry, null, 2), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: "application/json",
  });
}

async function readInquiry(pathname: string): Promise<{ inquiry: StoredInquiry; etag: string } | null> {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  const text = await new Response(result.stream).text();
  try {
    return { inquiry: parseStoredInquiry(text), etag: result.blob.etag };
  } catch (error) {
    console.error("Skipping unreadable inquiry", pathname, error);
    return null;
  }
}

/** The newest inquiries first, and the total number stored. */
export async function listInquiries(): Promise<{ inquiries: StoredInquiry[]; total: number }> {
  if (!isInquiryStorageConfigured()) return { inquiries: [], total: 0 };
  const pathnames: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: PREFIX, cursor, limit: 1000 });
    pathnames.push(...page.blobs.map((b) => b.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  // Ids start with a UTC timestamp, so sorting the paths sorts by time.
  pathnames.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const newest = pathnames.slice(0, INQUIRY_LIST_LIMIT);
  const results = await Promise.all(newest.map((p) => readInquiry(p)));
  return {
    inquiries: results.filter((r): r is { inquiry: StoredInquiry; etag: string } => r !== null).map((r) => r.inquiry),
    total: pathnames.length,
  };
}

/** Rewrites one inquiry, only if it has not changed since it was read. */
async function updateInquiry(
  id: string,
  change: (inquiry: StoredInquiry) => StoredInquiry | null,
): Promise<StoredInquiry | null> {
  const pathname = pathnameFor(id);
  const current = await readInquiry(pathname);
  if (!current) return null;
  const next = change(current.inquiry);
  if (!next) return null;
  await put(pathname, JSON.stringify(next, null, 2), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    ifMatch: current.etag,
    contentType: "application/json",
  });
  return next;
}

/** One inquiry by id, or null. */
export async function getInquiry(id: string): Promise<StoredInquiry | null> {
  return (await readInquiry(pathnameFor(id)))?.inquiry ?? null;
}

/** Marks an inquiry as new or contacted (not when deleted or converted). */
export function setInquiryStatus(id: string, status: ActiveInquiryStatus): Promise<StoredInquiry | null> {
  return updateInquiry(id, (inquiry) =>
    inquiry.status === "new" || inquiry.status === "contacted" ? { ...inquiry, status } : null,
  );
}

/** Soft delete: the inquiry stays stored with status "deleted" and can be restored. Converted inquiries cannot be deleted. */
export function softDeleteInquiry(id: string, deletedAt: string): Promise<StoredInquiry | null> {
  return updateInquiry(id, (inquiry) =>
    inquiry.status === "new" || inquiry.status === "contacted"
      ? { ...inquiry, status: "deleted", deletedAt, statusBeforeDelete: inquiry.status }
      : null,
  );
}

/** Marks a contacted inquiry as converted to the given investor. */
export function markInquiryConverted(id: string, investorId: string, convertedAt: string): Promise<StoredInquiry | null> {
  return updateInquiry(id, (inquiry) =>
    inquiry.status === "contacted" ? { ...inquiry, status: "converted", investorId, convertedAt } : null,
  );
}

/** Restores a deleted inquiry to the status it had before it was deleted. */
export function restoreInquiry(id: string): Promise<StoredInquiry | null> {
  return updateInquiry(id, (inquiry) => {
    if (inquiry.status !== "deleted") return null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { deletedAt, statusBeforeDelete, ...rest } = inquiry;
    return { ...rest, status: statusBeforeDelete ?? "new" };
  });
}

/**
 * TEMPORARY: permanently removes an inquiry that is already soft-deleted.
 * Returns the removed inquiry, or null if it was not found or not deleted.
 */
export async function purgeInquiry(id: string): Promise<StoredInquiry | null> {
  const pathname = pathnameFor(id);
  const current = await readInquiry(pathname);
  if (!current || current.inquiry.status !== "deleted") return null;
  await del(pathname);
  return current.inquiry;
}
