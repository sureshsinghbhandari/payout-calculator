import "server-only";
import { BlobError, BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { can } from "../accounts";
import { isInquiryId } from "../inquiry";
import { isAccountStorageConfigured, listAdminUsers } from "./accounts-store";
import { writableEtag } from "./blob-etag";

/**
 * Unread new-inquiry notifications, one counter per admin. Each admin has their
 * own private JSON file in Vercel Blob ("notifications/<env>/<adminId>.json")
 * listing the inquiries they have not opened yet, so one admin reading an
 * inquiry never changes another admin's count. Writes check the ETag and retry
 * on a conflict.
 */
const ENV = process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_ENV || "local";
const PREFIX = `notifications/${ENV}/`;
const WRITE_ATTEMPTS = 6;
/** Most unread inquiries kept per admin; the oldest drop off. */
const UNREAD_LIMIT = 200;

interface UnreadEntry {
  id: string;
  /** ISO timestamp (UTC) the inquiry was received. */
  at: string;
}

function pathFor(adminId: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(adminId)) throw new Error("Invalid admin id.");
  return `${PREFIX}${adminId}.json`;
}

function parseUnread(data: unknown): UnreadEntry[] {
  const list = (data as { unread?: unknown } | null)?.unread;
  if (!Array.isArray(list)) return [];
  return list.flatMap((raw) => {
    const d = (raw ?? {}) as Record<string, unknown>;
    return typeof d.id === "string" && isInquiryId(d.id) && typeof d.at === "string" ? [{ id: d.id, at: d.at }] : [];
  });
}

async function read(adminId: string): Promise<{ unread: UnreadEntry[]; etag: string | null }> {
  const result = await get(pathFor(adminId), { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return { unread: [], etag: null };
  const text = await new Response(result.stream).text();
  return { unread: parseUnread(JSON.parse(text)), etag: writableEtag(result.blob.etag) };
}

function isConflict(error: unknown): boolean {
  return (
    error instanceof BlobPreconditionFailedError ||
    (error instanceof BlobError && /already exists/i.test(error.message))
  );
}

/** Reads, changes and writes one admin's list. `change` returns null to leave it as it is. */
async function mutate(adminId: string, change: (unread: UnreadEntry[]) => UnreadEntry[] | null): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const { unread, etag } = await read(adminId);
    const next = change(unread);
    if (next === null) return;
    try {
      await put(pathFor(adminId), JSON.stringify({ unread: next }), {
        access: "private",
        addRandomSuffix: false,
        contentType: "application/json",
        ...(etag ? { allowOverwrite: true, ifMatch: etag } : { allowOverwrite: false }),
      });
      return;
    } catch (error) {
      if (!isConflict(error) || attempt >= WRITE_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 150 * attempt));
    }
  }
}

/** The ids of the inquiries this admin has not opened yet. */
export async function unreadInquiryIds(adminId: string): Promise<string[]> {
  if (!isAccountStorageConfigured()) return [];
  return (await read(adminId)).unread.map((u) => u.id);
}

export async function unreadCount(adminId: string): Promise<number> {
  return (await unreadInquiryIds(adminId)).length;
}

/**
 * Adds a new inquiry to the unread list of every active admin who can see
 * inquiries (Master and Sales Admins). Failures are logged, never thrown, so
 * it is safe to run after the visitor's response.
 */
export async function notifyNewInquiry(inquiryId: string, at: string): Promise<void> {
  if (!isAccountStorageConfigured()) return;
  try {
    const admins = (await listAdminUsers()).filter((a) => a.active && can(a.role, "inquiries.view"));
    await Promise.all(
      admins.map((admin) =>
        mutate(admin.id, (unread) => {
          if (unread.some((u) => u.id === inquiryId)) return null;
          return [{ id: inquiryId, at }, ...unread].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, UNREAD_LIMIT);
        }).catch((error) => console.error("Notifying an admin of a new inquiry failed", admin.id, error)),
      ),
    );
  } catch (error) {
    console.error("Notifying admins of a new inquiry failed", inquiryId, error);
  }
}

/** This admin has opened the inquiry: it no longer counts for them. */
export async function markInquiryRead(adminId: string, inquiryId: string): Promise<void> {
  if (!isAccountStorageConfigured()) return;
  await mutate(adminId, (unread) => (unread.some((u) => u.id === inquiryId) ? unread.filter((u) => u.id !== inquiryId) : null));
}

export async function markAllInquiriesRead(adminId: string): Promise<void> {
  if (!isAccountStorageConfigured()) return;
  await mutate(adminId, (unread) => (unread.length === 0 ? null : []));
}

/** Takes an inquiry off everyone's unread list (it was deleted). */
export async function dropInquiryNotifications(inquiryId: string): Promise<void> {
  if (!isAccountStorageConfigured()) return;
  const admins = await listAdminUsers();
  await Promise.all(
    admins.map((admin) =>
      mutate(admin.id, (unread) => (unread.some((u) => u.id === inquiryId) ? unread.filter((u) => u.id !== inquiryId) : null)).catch(
        (error) => console.error("Removing a notification failed", admin.id, error),
      ),
    ),
  );
}
