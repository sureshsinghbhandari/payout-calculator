import "server-only";
import { StoreError, StoreConflictError, del, get, put } from "./object-store";
import { APP_ENV } from "./app-env";
import { writableEtag } from "./blob-etag";
import type { AuditEvent } from "../audit";
import { isInquiryId } from "../inquiry";
import { parseInquiryLog, type InquiryLog, type InquiryNote } from "../inquiry-log";

/**
 * Each inquiry's activity and notes are one private JSON document in Supabase
 * ("inquiry-log/<env>/<inquiryId>.json"). Writes check the ETag and retry on a
 * conflict. Production, preview and local development use separate folders.
 */
const ENV = APP_ENV;
const PREFIX = `inquiry-log/${ENV}/`;
const WRITE_ATTEMPTS = 6;

function logPath(inquiryId: string): string {
  if (!isInquiryId(inquiryId)) throw new Error("Invalid inquiry id.");
  return `${PREFIX}${inquiryId}.json`;
}

async function readLog(inquiryId: string): Promise<{ log: InquiryLog; etag: string | null }> {
  const result = await get(logPath(inquiryId), { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return { log: parseInquiryLog(inquiryId, null), etag: null };
  const text = await new Response(result.stream).text();
  return { log: parseInquiryLog(inquiryId, JSON.parse(text)), etag: writableEtag(result.blob.etag) };
}

function isConflict(error: unknown): boolean {
  return (
    error instanceof StoreConflictError ||
    (error instanceof StoreError && /already exists/i.test(error.message))
  );
}

/** Reads, changes and writes the log. `change` returns null to leave it as it is. */
async function mutateLog(inquiryId: string, change: (log: InquiryLog) => InquiryLog | null): Promise<InquiryLog> {
  for (let attempt = 1; ; attempt++) {
    const { log, etag } = await readLog(inquiryId);
    const next = change(log);
    if (next === null) return log;
    try {
      await put(logPath(inquiryId), JSON.stringify(next), {
        access: "private",
        addRandomSuffix: false,
        contentType: "application/json",
        ...(etag ? { allowOverwrite: true, ifMatch: etag } : { allowOverwrite: false }),
      });
      return next;
    } catch (error) {
      if (!isConflict(error) || attempt >= WRITE_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 150 * attempt));
    }
  }
}

export async function readInquiryLog(inquiryId: string): Promise<InquiryLog> {
  return (await readLog(inquiryId)).log;
}

/** Adds events that are not there yet. `backfilled` marks the older events as copied in. */
export function addInquiryEvents(inquiryId: string, events: AuditEvent[], backfilled = false): Promise<InquiryLog> {
  return mutateLog(inquiryId, (log) => {
    const known = new Set(log.events.map((e) => e.id));
    const fresh = events.filter((e) => !known.has(e.id));
    if (fresh.length === 0 && (log.backfilled || !backfilled)) return null;
    return { ...log, events: [...log.events, ...fresh], backfilled: log.backfilled || backfilled };
  });
}

export async function addInquiryNote(inquiryId: string, note: InquiryNote): Promise<void> {
  await mutateLog(inquiryId, (log) => (log.notes.some((n) => n.id === note.id) ? null : { ...log, notes: [...log.notes, note] }));
}

/** Removes the log of a permanently deleted inquiry. */
export async function deleteInquiryLog(inquiryId: string): Promise<void> {
  await del(logPath(inquiryId));
}
