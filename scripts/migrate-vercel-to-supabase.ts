/**
 * Copies everything from Vercel Blob into Supabase and then checks the copy.
 *
 *   npm run migrate:vercel-to-supabase -- --dry-run     (reads Blob, writes nothing)
 *   npm run migrate:vercel-to-supabase                  (copies, then reconciles)
 *   npm run migrate:vercel-to-supabase -- --verify-only (only compares Blob and Supabase)
 *
 * Needs BLOB_READ_WRITE_TOKEN (npx vercel env pull .env.local) plus SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY in .env.local.
 *
 * Safe by design:
 *  - It never deletes or changes anything in Blob.
 *  - Pathnames are kept as they are, so every ID, timestamp and document reference is preserved,
 *    and JSON content is copied byte for byte.
 *  - It never overwrites data already in Supabase: a document that exists with different content is
 *    reported as a DIFFERENCE and left alone (pass --overwrite to replace it on purpose).
 *  - Running it again is harmless: identical items are skipped.
 *  - Every failure is listed, and the exit code is 1 unless everything was copied or already identical.
 *    Do not switch the app to Supabase until the reconciliation at the end says OK.
 */
import { createHash } from "node:crypto";
import { get, list } from "@vercel/blob";
import { createClient } from "@supabase/supabase-js";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const VERIFY_ONLY = args.has("--verify-only");
const OVERWRITE = args.has("--overwrite");
const BUCKET = "investor-documents";

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!process.env.BLOB_READ_WRITE_TOKEN) fail("BLOB_READ_WRITE_TOKEN is not set (run: npx vercel env pull .env.local).");
if (!supabaseUrl || !supabaseKey) fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.");

const db = createClient(supabaseUrl!, supabaseKey!, { auth: { persistSession: false, autoRefreshToken: false } });

function fail(message: string): never {
  console.error(`ERROR: ${message}`);
  process.exit(2);
}

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const isJson = (path: string) => path.endsWith(".json");

async function readBlob(pathname: string): Promise<Uint8Array> {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) throw new Error("not found in Blob");
  return new Uint8Array(await new Response(result.stream).arrayBuffer());
}

async function listAllBlobs(): Promise<{ pathname: string; size: number }[]> {
  const out: { pathname: string; size: number }[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ cursor, limit: 1000 });
    out.push(...page.blobs.map((b) => ({ pathname: b.pathname, size: b.size })));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out.sort((a, b) => (a.pathname < b.pathname ? -1 : 1));
}

/** What Supabase holds for this pathname: its hash, or null when missing. */
async function readTarget(pathname: string): Promise<{ hash: string; size: number } | null> {
  if (isJson(pathname)) {
    const { data, error } = await db.from("kv_documents").select("body").eq("path", pathname).maybeSingle();
    if (error) throw new Error(`Supabase read failed: ${error.message}`);
    if (!data) return null;
    const bytes = new TextEncoder().encode(data.body as string);
    return { hash: sha(bytes), size: bytes.byteLength };
  }
  const { data, error } = await db.storage.from(BUCKET).download(pathname);
  if (error) {
    if (/not.?found|does not exist/i.test(error.message)) return null;
    throw new Error(`Supabase Storage read failed: ${error.message}`);
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  return { hash: sha(bytes), size: bytes.byteLength };
}

async function writeTarget(pathname: string, bytes: Uint8Array): Promise<void> {
  if (isJson(pathname)) {
    const { data, error } = await db.rpc("kv_put", {
      p_path: pathname,
      p_body: new TextDecoder().decode(bytes),
      p_expected_version: null,
      p_allow_overwrite: OVERWRITE,
    });
    if (error) throw new Error(`Supabase write failed: ${error.message}`);
    if (data !== "ok") throw new Error("Supabase refused the write (document appeared meanwhile)");
    return;
  }
  const contentType = pathname.endsWith(".pdf") ? "application/pdf" : pathname.endsWith(".png") ? "image/png" : "image/jpeg";
  const { error } = await db.storage.from(BUCKET).upload(pathname, bytes, { contentType, upsert: OVERWRITE });
  if (error) throw new Error(`Supabase Storage write failed: ${error.message}`);
}

interface Row {
  pathname: string;
  result: "copied" | "identical" | "would-copy" | "DIFFERENT" | "FAILED" | "verified" | "MISSING" | "MISMATCH";
  detail?: string;
}

async function main() {
  console.log(`Mode: ${VERIFY_ONLY ? "verify only" : DRY_RUN ? "DRY RUN (nothing is written)" : "copy + verify"}${OVERWRITE ? " (overwrite)" : ""}`);
  const blobs = await listAllBlobs();
  console.log(`Found ${blobs.length} items in Vercel Blob (${blobs.filter((b) => isJson(b.pathname)).length} documents, ${blobs.filter((b) => !isJson(b.pathname)).length} files).`);

  const copyRows: Row[] = [];
  if (!VERIFY_ONLY) {
    for (const blob of blobs) {
      try {
        const bytes = await readBlob(blob.pathname);
        const existing = await readTarget(blob.pathname);
        if (existing && existing.hash === sha(bytes)) copyRows.push({ pathname: blob.pathname, result: "identical" });
        else if (existing && !OVERWRITE) copyRows.push({ pathname: blob.pathname, result: "DIFFERENT", detail: "Supabase already has different content; left untouched" });
        else if (DRY_RUN) copyRows.push({ pathname: blob.pathname, result: "would-copy", detail: `${bytes.byteLength} bytes` });
        else {
          await writeTarget(blob.pathname, bytes);
          copyRows.push({ pathname: blob.pathname, result: "copied", detail: `${bytes.byteLength} bytes` });
        }
      } catch (error) {
        copyRows.push({ pathname: blob.pathname, result: "FAILED", detail: (error as Error).message });
      }
    }
  }

  // Reconciliation: every Blob item must exist in Supabase with identical content.
  const verifyRows: Row[] = [];
  let missingFiles = 0;
  if (!DRY_RUN) {
    for (const blob of blobs) {
      try {
        const bytes = await readBlob(blob.pathname);
        const target = await readTarget(blob.pathname);
        if (!target) verifyRows.push({ pathname: blob.pathname, result: "MISSING" });
        else if (target.hash !== sha(bytes) || target.size !== bytes.byteLength) verifyRows.push({ pathname: blob.pathname, result: "MISMATCH", detail: "content differs" });
        else verifyRows.push({ pathname: blob.pathname, result: "verified" });
      } catch (error) {
        verifyRows.push({ pathname: blob.pathname, result: "FAILED", detail: (error as Error).message });
      }
    }
  }

  const count = (rows: Row[], result: Row["result"]) => rows.filter((r) => r.result === result).length;
  console.log("\n=== Copy ===");
  for (const result of ["copied", "identical", "would-copy", "DIFFERENT", "FAILED"] as const) {
    console.log(`${result.padEnd(11)} ${count(copyRows, result)}`);
  }
  for (const row of copyRows.filter((r) => r.result === "DIFFERENT" || r.result === "FAILED")) console.log(`  ${row.result}: ${row.pathname} - ${row.detail}`);

  if (!DRY_RUN) {
    console.log("\n=== Reconciliation (Blob vs Supabase, content compared by SHA-256) ===");
    for (const result of ["verified", "MISSING", "MISMATCH", "FAILED"] as const) {
      console.log(`${result.padEnd(11)} ${count(verifyRows, result)}`);
    }
    for (const row of verifyRows.filter((r) => r.result !== "verified")) console.log(`  ${row.result}: ${row.pathname}${row.detail ? ` - ${row.detail}` : ""}`);
    // Key relationships: every document listed in an index must have its file.
    missingFiles = await checkDocumentFiles(blobs.map((b) => b.pathname));
  }

  const problems =
    missingFiles +
    count(copyRows, "DIFFERENT") + count(copyRows, "FAILED") + count(verifyRows, "MISSING") + count(verifyRows, "MISMATCH") + count(verifyRows, "FAILED");
  if (DRY_RUN) console.log("\nDry run finished. Run again without --dry-run to copy.");
  else if (problems === 0) console.log(`\nOK: all ${blobs.length} items are in Supabase with identical content. Blob data was not touched.`);
  else console.log(`\nNOT OK: ${problems} problem(s) above. Do not switch to Supabase yet.`);
  process.exit(problems === 0 ? 0 : 1);
}

/** Every document in a documents index should have its file in Supabase Storage. */
async function checkDocumentFiles(blobPaths: string[]): Promise<number> {
  const indexes = blobPaths.filter((p) => /^documents\/[^/]+\/index\.json$/.test(p));
  let documents = 0;
  const missing: string[] = [];
  for (const indexPath of indexes) {
    const { data } = await db.from("kv_documents").select("body").eq("path", indexPath).maybeSingle();
    if (!data) continue;
    const parsed = JSON.parse(data.body as string) as { documents?: { pathname?: string }[] };
    for (const doc of parsed.documents ?? []) {
      if (!doc.pathname) continue;
      documents++;
      if (!(await readTarget(doc.pathname))) missing.push(doc.pathname);
    }
  }
  console.log(`\nDocument index check: ${documents} listed documents, ${missing.length} without a file in Supabase Storage.`);
  for (const p of missing) console.log(`  MISSING FILE: ${p}`);
  return missing.length;
}

main().catch((error) => {
  console.error("Migration stopped:", error);
  process.exit(2);
});
