import "server-only";
import { BlobError, BlobPreconditionFailedError, get, put } from "@vercel/blob";
import {
  EMAIL_LIMITS,
  parseThread,
  parseUnmatched,
  type EmailDelivery,
  type EmailMessage,
  type EmailThread,
  type UnmatchedEmail,
} from "../email";
import { isInquiryId } from "../inquiry";

/**
 * Each inquiry's emails are one private JSON file in Vercel Blob
 * ("emails/<env>/<inquiryId>.json"); incoming emails that match no inquiry go to
 * "emails/<env>/unmatched.json". Writes check the ETag and retry on a conflict.
 */
const ENV = process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_ENV || "local";
const PREFIX = `emails/${ENV}/`;
const UNMATCHED_PATH = `${PREFIX}unmatched.json`;
const WRITE_ATTEMPTS = 6;

function threadPath(inquiryId: string): string {
  if (!isInquiryId(inquiryId)) throw new Error("Invalid inquiry id.");
  return `${PREFIX}${inquiryId}.json`;
}

async function readJson(path: string): Promise<{ data: unknown; etag: string | null }> {
  const result = await get(path, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return { data: null, etag: null };
  const text = await new Response(result.stream).text();
  return { data: JSON.parse(text), etag: result.blob.etag };
}

function isConflict(error: unknown): boolean {
  return (
    error instanceof BlobPreconditionFailedError ||
    (error instanceof BlobError && /already exists/i.test(error.message))
  );
}

/** Reads, changes and writes one file. `change` returns null to leave it as it is. */
async function mutate<T>(path: string, parse: (data: unknown) => T, change: (current: T) => T | null): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const { data, etag } = await readJson(path);
    const current = parse(data);
    const next = change(current);
    if (next === null) return current;
    try {
      await put(path, JSON.stringify(next), {
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

/** All emails of one inquiry, oldest first. */
export async function getThread(inquiryId: string): Promise<EmailThread> {
  const { data } = await readJson(threadPath(inquiryId));
  const thread = parseThread(inquiryId, data);
  thread.messages.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return thread;
}

/** Adds an email to a thread. Returns false if it was already there (webhooks can repeat). */
export async function addThreadMessage(inquiryId: string, message: EmailMessage): Promise<boolean> {
  let added = false;
  await mutate(threadPath(inquiryId), (data) => parseThread(inquiryId, data), (thread) => {
    if (thread.messages.some((m) => m.id === message.id)) return null;
    added = true;
    return { ...thread, messages: [...thread.messages, message] };
  });
  return added;
}

/** Records the delivery state of a sent email. Returns the updated message, or null if it is not in the thread. */
export async function setMessageDelivery(
  inquiryId: string,
  emailId: string,
  delivery: EmailDelivery,
  note: string | undefined,
  messageId: string | undefined,
): Promise<EmailMessage | null> {
  let updated: EmailMessage | null = null;
  await mutate(threadPath(inquiryId), (data) => parseThread(inquiryId, data), (thread) => {
    const index = thread.messages.findIndex((m) => m.id === emailId && m.direction === "out");
    if (index === -1) return null;
    const current = thread.messages[index];
    // A late "delivered" never hides an earlier bounce or failure.
    if (delivery === "delivered" && current.delivery && current.delivery !== "sent") return null;
    updated = {
      ...current,
      delivery,
      ...(note ? { deliveryNote: note } : {}),
      ...(messageId && !current.messageId ? { messageId } : {}),
    };
    const messages = [...thread.messages];
    messages[index] = updated;
    return { ...thread, messages };
  });
  return updated;
}

/** Where the last Gmail inbox check stopped (Gmail provider only). */
export interface GmailCheckState {
  uidValidity: string | null;
  lastUid: number;
  /** ISO timestamp (UTC) of the last check, successful or not. */
  checkedAt: string | null;
  /** Error of the last check, if it failed. */
  error: string | null;
}

const GMAIL_STATE_PATH = `${PREFIX}gmail-state.json`;

export async function readGmailState(): Promise<GmailCheckState> {
  const { data } = await readJson(GMAIL_STATE_PATH);
  const d = (data ?? {}) as Partial<GmailCheckState>;
  return {
    uidValidity: typeof d.uidValidity === "string" ? d.uidValidity : null,
    lastUid: typeof d.lastUid === "number" && Number.isFinite(d.lastUid) ? d.lastUid : 0,
    checkedAt: typeof d.checkedAt === "string" ? d.checkedAt : null,
    error: typeof d.error === "string" ? d.error : null,
  };
}

/** Saves the check state. Never moves lastUid backwards when two checks overlap. */
export async function saveGmailState(next: GmailCheckState): Promise<void> {
  await mutate(GMAIL_STATE_PATH, (data) => data as Partial<GmailCheckState> | null, (current) => {
    const keepUid = current?.uidValidity === next.uidValidity && (current?.lastUid ?? 0) > next.lastUid;
    return { ...next, lastUid: keepUid ? (current?.lastUid ?? next.lastUid) : next.lastUid };
  });
}

/** Incoming emails that matched no inquiry, newest first. */
export async function listUnmatchedEmails(): Promise<UnmatchedEmail[]> {
  const { data } = await readJson(UNMATCHED_PATH);
  return parseUnmatched(data).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** Keeps an incoming email that matched no inquiry (the newest 100 are kept). Returns false if already kept. */
export async function addUnmatchedEmail(email: UnmatchedEmail): Promise<boolean> {
  let added = false;
  await mutate(UNMATCHED_PATH, (data) => ({ emails: parseUnmatched(data) }), ({ emails }) => {
    if (emails.some((e) => e.id === email.id)) return null;
    added = true;
    return { emails: [...emails, email].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, EMAIL_LIMITS.unmatched) };
  });
  return added;
}
