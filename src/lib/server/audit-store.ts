import "server-only";
import { randomBytes } from "node:crypto";
import { BlobError, BlobPreconditionFailedError, get, list, put } from "@vercel/blob";
import { writableEtag } from "./blob-etag";
import { after } from "next/server";
import { auditMonth, auditMonthsBetween, isAuditMonth, parseAuditEvents, type AuditEvent, type NewAuditEvent } from "../audit";
import { isInquiryId } from "../inquiry";
import type { InquiryLog } from "../inquiry-log";
import { addInquiryEvents, readInquiryLog } from "./inquiry-log-store";

/**
 * Audit events are appended to one private JSON file per month in Vercel Blob
 * ("audit/<env>/<YYYY-MM>.json"). Writes check the file's ETag and retry on a
 * conflict, so simultaneous events are not lost. Production, preview and local
 * development use separate folders. Events about an inquiry are also copied to
 * that inquiry's log, so they show on the inquiry page.
 */
const ENV = process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_ENV || "local";
const PREFIX = `audit/${ENV}/`;
const WRITE_ATTEMPTS = 6;

function isConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

function pathFor(month: string): string {
  if (!isAuditMonth(month)) throw new Error("Invalid audit month.");
  return `${PREFIX}${month}.json`;
}

function parseEvents(data: unknown): AuditEvent[] {
  return parseAuditEvents((data as { events?: unknown })?.events);
}

/** The inquiry an event belongs to, if its log should get a copy (not once it is permanently deleted). */
function inquiryOf(event: AuditEvent): string | null {
  const id = event.target?.type === "inquiry" ? event.target.id : undefined;
  return id && isInquiryId(id) && event.action !== "inquiry.purged" ? id : null;
}

async function readMonth(month: string): Promise<{ events: AuditEvent[]; etag: string | null }> {
  const result = await get(pathFor(month), { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return { events: [], etag: null };
  const text = await new Response(result.stream).text();
  return { events: parseEvents(JSON.parse(text)), etag: writableEtag(result.blob.etag) };
}

function isConflict(error: unknown): boolean {
  return (
    error instanceof BlobPreconditionFailedError ||
    (error instanceof BlobError && /already exists/i.test(error.message))
  );
}

async function append(event: AuditEvent): Promise<void> {
  const path = pathFor(auditMonth(event.at));
  for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt++) {
    const { events, etag } = await readMonth(auditMonth(event.at));
    try {
      await put(path, JSON.stringify({ events: [...events, event] }), {
        access: "private",
        addRandomSuffix: false,
        contentType: "application/json",
        ...(etag ? { allowOverwrite: true, ifMatch: etag } : { allowOverwrite: false }),
      });
      return;
    } catch (error) {
      if (!isConflict(error) || attempt === WRITE_ATTEMPTS) throw error;
      // Back off a little so concurrent writers spread out.
      await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 150 * attempt));
    }
  }
}

/**
 * Records an audit event after the response is sent, so it never slows down or
 * breaks the action that triggered it. Failures are logged, not thrown.
 */
export function recordAudit(event: NewAuditEvent): void {
  if (!isConfigured()) return;
  const full: AuditEvent = {
    ...event,
    id: randomBytes(6).toString("hex"),
    at: new Date().toISOString(),
  };
  const write = async () => {
    const inquiryId = inquiryOf(full);
    await Promise.all([
      append(full).catch((error) => console.error("Recording audit event failed", full.action, error)),
      inquiryId &&
        addInquiryEvents(inquiryId, [full]).catch((error) =>
          console.error("Copying audit event to the inquiry failed", full.action, error),
        ),
    ]);
  };
  try {
    after(write);
  } catch {
    // Outside a request (should not happen): write directly.
    void write();
  }
}

/** Events of one month, newest first. */
export async function listAuditEvents(month: string): Promise<AuditEvent[]> {
  if (!isConfigured()) return [];
  const { events } = await readMonth(month);
  return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/**
 * Events from `fromIso` (inclusive) to `toIso` (exclusive), oldest first.
 * Reads one file per month in the range, so keep ranges to about a year.
 */
export async function listAuditEventsBetween(fromIso: string, toIso: string): Promise<AuditEvent[]> {
  if (!isConfigured()) return [];
  const months = auditMonthsBetween(fromIso, toIso);
  const perMonth = await Promise.all(months.map(async (month) => (await readMonth(month)).events));
  return perMonth
    .flat()
    .filter((e) => e.at >= fromIso && e.at < toIso)
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** Months that have audit events, newest first. */
export async function listAuditMonths(): Promise<string[]> {
  if (!isConfigured()) return [];
  const result = await list({ prefix: PREFIX, limit: 1000 });
  return result.blobs
    .map((b) => b.pathname.slice(PREFIX.length).replace(/\.json$/, ""))
    .filter(isAuditMonth)
    .sort()
    .reverse();
}

/**
 * The activity and notes of one inquiry. The first time, events recorded
 * before inquiry logs existed are copied in from the monthly files.
 */
export async function getInquiryActivity(inquiryId: string, createdAt: string): Promise<InquiryLog> {
  const log = await readInquiryLog(inquiryId);
  if (log.backfilled || !isConfigured()) return log;
  const months = (await listAuditMonths()).filter((m) => m >= auditMonth(createdAt));
  const found = (await Promise.all(months.map(async (m) => (await readMonth(m)).events)))
    .flat()
    .filter((e) => inquiryOf(e) === inquiryId);
  try {
    return await addInquiryEvents(inquiryId, found, true);
  } catch (error) {
    console.error("Copying earlier events to the inquiry failed", error);
    return { ...log, events: [...log.events, ...found.filter((e) => !log.events.some((k) => k.id === e.id))] };
  }
}
