import "server-only";
import { BlobPreconditionFailedError, del, get, list, put } from "@vercel/blob";
import { writableEtag } from "./blob-etag";
import {
  isInquiryId,
  NOTE_PREVIEW_LENGTH,
  parseStoredInquiry,
  type ActiveInquiryStatus,
  type InquiryNotesSummary,
  type StoredInquiry,
} from "../inquiry";
import { deleteInquiryLog } from "./inquiry-log-store";

/** Rewrite attempts when two changes to the same inquiry overlap. */
const UPDATE_ATTEMPTS = 4;

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
    return { inquiry: parseStoredInquiry(text), etag: writableEtag(result.blob.etag) };
  } catch (error) {
    console.error("Skipping unreadable inquiry", pathname, error);
    return null;
  }
}

async function listPathnames(): Promise<string[]> {
  const pathnames: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: PREFIX, cursor, limit: 1000 });
    pathnames.push(...page.blobs.map((b) => b.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return pathnames;
}

/** The newest inquiries first, and the total number stored. */
export async function listInquiries(): Promise<{ inquiries: StoredInquiry[]; total: number }> {
  if (!isInquiryStorageConfigured()) return { inquiries: [], total: 0 };
  const pathnames = await listPathnames();

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

/**
 * The id of the newest inquiry whose reference (the last 8 characters of the
 * id, e.g. "A1B2C3D4") matches, or null.
 */
export async function findInquiryIdByReference(reference: string): Promise<string | null> {
  if (!/^[0-9A-F]{8}$/i.test(reference)) return null;
  const suffix = `-${reference.toLowerCase()}.json`;
  const match = (await listPathnames())
    .filter((p) => p.endsWith(suffix))
    .sort()
    .pop();
  const id = match?.slice(PREFIX.length, -".json".length);
  return id && isInquiryId(id) ? id : null;
}

/** updateInquiry, retried when another change got there first. */
async function updateInquiryWithRetry(id: string, change: (inquiry: StoredInquiry) => StoredInquiry | null): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await updateInquiry(id, change);
      return;
    } catch (error) {
      if (!(error instanceof BlobPreconditionFailedError) || attempt >= UPDATE_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 150 * attempt));
    }
  }
}

/** Updates the email summary on an inquiry after an email is sent or received. Retries on conflicts. */
export function noteInquiryEmail(id: string, direction: "in" | "out", at: string): Promise<void> {
  return updateInquiryWithRetry(id, (inquiry) => ({
    ...inquiry,
    emails: {
      count: (inquiry.emails?.count ?? 0) + 1,
      lastAt: inquiry.emails && inquiry.emails.lastAt > at ? inquiry.emails.lastAt : at,
      lastDirection: inquiry.emails && inquiry.emails.lastAt > at ? inquiry.emails.lastDirection : direction,
    },
  }));
}

/** Updates the notes summary on an inquiry after a note is added. Retries on conflicts. */
export function noteInquiryNote(id: string, last: InquiryNotesSummary["last"]): Promise<void> {
  const preview = last.text.length > NOTE_PREVIEW_LENGTH ? `${last.text.slice(0, NOTE_PREVIEW_LENGTH - 1)}…` : last.text;
  return updateInquiryWithRetry(id, (inquiry) => ({
    ...inquiry,
    notes: {
      count: (inquiry.notes?.count ?? 0) + 1,
      last: inquiry.notes && inquiry.notes.last.at > last.at ? inquiry.notes.last : { ...last, text: preview },
    },
  }));
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
  await deleteInquiryLog(id).catch((error) => console.error("Removing the inquiry log failed", error));
  return current.inquiry;
}
