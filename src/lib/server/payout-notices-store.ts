import "server-only";
import { BlobError, BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { writableEtag } from "./blob-etag";
import { DEFAULT_REMINDER_DAYS, parseNoticeRun, parseReminderDays, type NoticeRun } from "../payout-notices";

/**
 * Payout emails storage, two private JSON files in Vercel Blob:
 * - "settings/<env>/payout-notices.json": the reminder days setting and the
 *   summary of the last run of the reminder job.
 * - "notices/<env>/payout-notices-sent.json": the sent-log, one entry per
 *   email keyed by investment, payout number and kind (see noticeKey).
 * Writes check the ETag and retry on a conflict, so the daily job and Run now
 * at the same moment can never both claim (and send) the same reminder.
 */
const ENV = process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_ENV || "local";
const SETTINGS_PATH = `settings/${ENV}/payout-notices.json`;
const SENT_PATH = `notices/${ENV}/payout-notices-sent.json`;
const WRITE_ATTEMPTS = 6;
/** Sent-log entries older than this are dropped: their payouts are long past. */
const KEEP_SENT_DAYS = 400;

export function isNoticeStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

function isConflict(error: unknown): boolean {
  return (
    error instanceof BlobPreconditionFailedError ||
    (error instanceof BlobError && /already exists/i.test(error.message))
  );
}

async function readJson(path: string): Promise<{ data: unknown; etag: string | null }> {
  if (!isNoticeStorageConfigured()) return { data: null, etag: null };
  const result = await get(path, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return { data: null, etag: null };
  const text = await new Response(result.stream).text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch (error) {
    // A damaged file starts over; the next write replaces it.
    console.error("Stored payout notices file could not be parsed", path, error);
  }
  return { data, etag: writableEtag(result.blob.etag) };
}

/** Reads the file, applies `change` and writes it back, retrying on a conflict. */
async function mutateJson<T, R>(
  path: string,
  parse: (data: unknown) => T,
  change: (current: T) => { next: T; result: R },
): Promise<R> {
  if (!isNoticeStorageConfigured()) throw new Error("Storage is not configured.");
  for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt++) {
    const { data, etag } = await readJson(path);
    const { next, result } = change(parse(data));
    try {
      await put(path, JSON.stringify(next, null, 2), {
        access: "private",
        addRandomSuffix: false,
        contentType: "application/json",
        ...(etag ? { allowOverwrite: true, ifMatch: etag } : { allowOverwrite: false }),
      });
      return result;
    } catch (error) {
      if (!isConflict(error) || attempt === WRITE_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 150 * attempt));
    }
  }
  throw new Error("Saving failed.");
}

// ---------- settings and last run ----------

export interface PayoutNoticeSettings {
  /** Days before a payout the reminder is sent; 0 means reminders are off. */
  reminderDays: number;
  updatedAt: string | null;
  updatedBy: string | null;
  lastRun: NoticeRun | null;
}

function parseSettings(data: unknown): PayoutNoticeSettings {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    reminderDays: parseReminderDays(d.reminderDays) ?? DEFAULT_REMINDER_DAYS,
    updatedAt: typeof d.updatedAt === "string" ? d.updatedAt : null,
    updatedBy: typeof d.updatedBy === "string" ? d.updatedBy : null,
    lastRun: parseNoticeRun(d.lastRun),
  };
}

export async function readPayoutNoticeSettings(): Promise<PayoutNoticeSettings> {
  return parseSettings((await readJson(SETTINGS_PATH)).data);
}

export function saveReminderDays(days: number, by: { name: string }): Promise<PayoutNoticeSettings> {
  return mutateJson(SETTINGS_PATH, parseSettings, (current) => {
    const next = { ...current, reminderDays: days, updatedAt: new Date().toISOString(), updatedBy: by.name };
    return { next, result: next };
  });
}

export function saveLastNoticeRun(run: NoticeRun): Promise<void> {
  return mutateJson(SETTINGS_PATH, parseSettings, (current) => ({ next: { ...current, lastRun: run }, result: undefined }));
}

// ---------- sent-log ----------

interface SentEntry {
  key: string;
  /** ISO timestamp the email was claimed or sent. */
  at: string;
}

interface SentLog {
  sent: SentEntry[];
}

function parseSentLog(data: unknown): SentLog {
  const list = (data as { sent?: unknown } | null)?.sent;
  if (!Array.isArray(list)) return { sent: [] };
  const cutoff = new Date(Date.now() - KEEP_SENT_DAYS * 86_400_000).toISOString();
  const seen = new Set<string>();
  const sent: SentEntry[] = [];
  for (const raw of list) {
    const e = raw as Partial<SentEntry> | null;
    if (typeof e?.key !== "string" || typeof e.at !== "string" || e.at < cutoff || seen.has(e.key)) continue;
    seen.add(e.key);
    sent.push({ key: e.key, at: e.at });
  }
  return { sent };
}

/**
 * Adds the keys that are not in the sent-log yet and returns them: only those
 * may be sent. A claimed email that then fails is released again (see
 * releaseNotices), so the next run tries again.
 */
export function claimNotices(keys: readonly string[]): Promise<string[]> {
  if (keys.length === 0) return Promise.resolve([]);
  return mutateJson(SENT_PATH, parseSentLog, (log) => {
    const taken = new Set(log.sent.map((e) => e.key));
    const at = new Date().toISOString();
    const claimed = [...new Set(keys)].filter((key) => !taken.has(key));
    return { next: { sent: [...log.sent, ...claimed.map((key) => ({ key, at }))] }, result: claimed };
  });
}

/** Removes claimed keys whose email could not be sent. */
export function releaseNotices(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return Promise.resolve();
  const release = new Set(keys);
  return mutateJson(SENT_PATH, parseSentLog, (log) => ({
    next: { sent: log.sent.filter((e) => !release.has(e.key)) },
    result: undefined,
  }));
}

/** Notes a sent email (add-only: an existing entry is kept as it is). */
export function addSentNotice(key: string): Promise<void> {
  return mutateJson(SENT_PATH, parseSentLog, (log) => ({
    next: log.sent.some((e) => e.key === key) ? log : { sent: [...log.sent, { key, at: new Date().toISOString() }] },
    result: undefined,
  }));
}
