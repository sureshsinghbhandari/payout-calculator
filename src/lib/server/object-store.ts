import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Persistent storage for every hosting provider (Vercel, Netlify, Cloudflare):
 * Supabase, one shared project.
 *
 *  - JSON documents ("*.json") live in the `kv_documents` table. Each write is an
 *    atomic compare-and-set (`kv_put`), so the optimistic-concurrency behaviour the
 *    stores relied on (read, change, write only if unchanged, retry on conflict)
 *    is unchanged. The document's version number plays the role of the ETag.
 *  - Other files (investor PDFs and images) live in the private Storage bucket
 *    `investor-documents`. They are only ever served through routes that check who
 *    is asking.
 *
 * The functions mirror the small part of the old Vercel Blob API the stores used
 * (get, put, del, list), so the stores' logic did not have to change.
 * Server-only: it uses the service-role key, which must never reach the browser.
 */

export const DOCUMENTS_BUCKET = "investor-documents";

export class StoreError extends Error {}
/** A write whose precondition failed: the document changed (or already exists). */
export class StoreConflictError extends StoreError {}

export function isObjectStoreConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

let cached: SupabaseClient | null = null;

/** The server-side Supabase client (service role). Throws when it is not configured. */
export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new StoreError("Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Data must always be fresh: never let a framework or CDN cache these calls.
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  return cached;
}

const isJson = (path: string) => path.endsWith(".json");

export interface StoredFile {
  statusCode: 200;
  stream: ReadableStream<Uint8Array>;
  blob: { pathname: string; etag: string; size: number };
}

/** The file or document at `path`, or null when there is none. Other failures throw. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the options of the old Blob call are accepted and ignored
export async function get(path: string, _options?: { access?: "private"; useCache?: boolean }): Promise<StoredFile | null> {
  const db = supabaseAdmin();
  if (isJson(path)) {
    const { data, error } = await db.from("kv_documents").select("body,version").eq("path", path).maybeSingle();
    if (error) throw new StoreError(`Reading ${path} failed: ${error.message}`);
    if (!data) return null;
    const bytes = new TextEncoder().encode(data.body as string);
    return {
      statusCode: 200,
      stream: new Response(bytes).body!,
      blob: { pathname: path, etag: String(data.version), size: bytes.byteLength },
    };
  }
  const { data, error } = await db.storage.from(DOCUMENTS_BUCKET).download(path);
  if (error) {
    // Storage reports a missing object as a 400/404 "not found" error.
    if (/not.?found|does not exist/i.test(error.message)) return null;
    throw new StoreError(`Reading ${path} failed: ${error.message}`);
  }
  return { statusCode: 200, stream: data.stream() as ReadableStream<Uint8Array>, blob: { pathname: path, etag: "", size: data.size } };
}

export interface PutOptions {
  /** Replace an existing document. Without `ifMatch` this overwrites unconditionally. */
  allowOverwrite?: boolean;
  /** Replace only this version (a value from a previous `get`). */
  ifMatch?: string;
  contentType?: string;
  /** Accepted for compatibility with the old Blob calls; everything here is private and unsuffixed. */
  access?: "private";
  addRandomSuffix?: boolean;
  cacheControlMaxAge?: number;
}

/** Writes a document or file. Throws StoreConflictError when `ifMatch`/create-only does not hold. */
export async function put(path: string, body: string | Uint8Array | Blob, options: PutOptions = {}): Promise<{ pathname: string }> {
  const db = supabaseAdmin();
  if (isJson(path)) {
    if (typeof body !== "string") throw new StoreError("JSON documents must be written as text.");
    let expected: number | null = null;
    if (options.ifMatch !== undefined) {
      expected = Number(options.ifMatch);
      if (!Number.isSafeInteger(expected)) throw new StoreConflictError("The stored version no longer matches.");
    }
    const { data, error } = await db.rpc("kv_put", {
      p_path: path,
      p_body: body,
      p_expected_version: expected,
      p_allow_overwrite: options.allowOverwrite === true,
    });
    if (error) throw new StoreError(`Writing ${path} failed: ${error.message}`);
    if (data !== "ok") throw new StoreConflictError(`${path} already exists or was changed by someone else.`);
    return { pathname: path };
  }
  const { error } = await db.storage.from(DOCUMENTS_BUCKET).upload(path, body, {
    contentType: options.contentType,
    upsert: options.allowOverwrite === true,
  });
  if (error) {
    if (/already exists|duplicate/i.test(error.message)) throw new StoreConflictError(`${path} already exists.`);
    throw new StoreError(`Writing ${path} failed: ${error.message}`);
  }
  return { pathname: path };
}

/** Deletes a document or file. Deleting something that is not there is not an error. */
export async function del(paths: string | string[]): Promise<void> {
  const db = supabaseAdmin();
  const all = Array.isArray(paths) ? paths : [paths];
  const json = all.filter(isJson);
  const files = all.filter((p) => !isJson(p));
  if (json.length > 0) {
    const { error } = await db.from("kv_documents").delete().in("path", json);
    if (error) throw new StoreError(`Deleting documents failed: ${error.message}`);
  }
  if (files.length > 0) {
    const { error } = await db.storage.from(DOCUMENTS_BUCKET).remove(files);
    if (error) throw new StoreError(`Deleting files failed: ${error.message}`);
  }
}

/** Lists documents (JSON only) whose path starts with `prefix`, in path order, one page at a time. */
export async function list(options: { prefix: string; cursor?: string; limit?: number }): Promise<{
  blobs: { pathname: string }[];
  hasMore: boolean;
  cursor?: string;
}> {
  const limit = Math.min(Math.max(options.limit ?? 1000, 1), 1000);
  // Paths are plain ASCII, so a range scan on the prefix is exact (no LIKE escaping needed).
  let query = supabaseAdmin()
    .from("kv_documents")
    .select("path")
    .gte("path", options.prefix)
    .lt("path", `${options.prefix}￿`)
    .order("path", { ascending: true })
    .limit(limit + 1);
  if (options.cursor) query = query.gt("path", options.cursor);
  const { data, error } = await query;
  if (error) throw new StoreError(`Listing ${options.prefix} failed: ${error.message}`);
  const rows = (data ?? []) as { path: string }[];
  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  return { blobs: page.map((r) => ({ pathname: r.path })), hasMore, cursor: hasMore ? page[page.length - 1].path : undefined };
}

/**
 * A short-lived URL the browser can upload one file to directly (so the file does not pass through
 * this server, whose request size is limited). Only this exact path can be written, and only once.
 */
export async function createUploadTarget(path: string): Promise<{ signedUrl: string; token: string }> {
  const { data, error } = await supabaseAdmin().storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new StoreError(`Could not create an upload URL: ${error?.message ?? "unknown error"}`);
  return { signedUrl: data.signedUrl, token: data.token };
}

/** Safe, non-destructive reachability checks for the health endpoint. */
export async function checkStore(): Promise<{ database: boolean; storage: boolean }> {
  const db = supabaseAdmin();
  const [database, storage] = await Promise.all([
    db.from("kv_documents").select("path", { head: true, count: "exact" }).limit(1),
    db.storage.getBucket(DOCUMENTS_BUCKET),
  ]);
  return { database: !database.error, storage: !storage.error && storage.data?.public === false };
}
