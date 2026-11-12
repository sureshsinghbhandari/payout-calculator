# Data migration: Vercel Blob -> Supabase

Production currently holds test data only, so this is low risk, but treat it as if it were real.

## Steps

1. Pull the Blob token and add the Supabase keys to `.env.local`:
   ```bash
   npx vercel env pull .env.local
   ```
   Then add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (dashboard > Project Settings > API).
2. Dry run (reads Blob, writes nothing, lists what would be copied):
   ```bash
   npm run migrate:vercel-to-supabase -- --dry-run
   ```
3. Copy and reconcile:
   ```bash
   npm run migrate:vercel-to-supabase
   ```
4. Only continue when the last line says **OK** (exit code 0).

## What it does

- Lists every item in Blob; each JSON document goes to `kv_documents` with the same path, every file to the private
  Storage bucket with the same path. IDs, timestamps and document references are inside the copied content, so they
  are preserved exactly.
- **Never deletes or changes Blob.** Never overwrites Supabase data: if a document already exists with different
  content it is reported as `DIFFERENT` and left alone (`--overwrite` replaces it on purpose).
- Repeatable: identical items are `identical` (skipped).
- **Reconciliation:** every Blob item is read again and compared with Supabase by SHA-256 and size; missing or
  mismatching items are listed. It also checks that every document in each `documents/<env>/index.json` has its
  file in Storage. Failures are never silently ignored: any problem gives a `NOT OK` summary and exit code 1.
- `--verify-only` runs just the comparison (use it again after the cut-over).

## Cut-over

1. Run the migration (above) while the app is still on Blob-less code paths; no writes should happen between the
   copy and the switch. For go-live, pause admin activity, run the migration once more, confirm `OK`.
2. Deploy this branch. Check `/api/health`, sign in, open an investor, download a document, view the rates.
3. Keep the Blob store and its token for at least a few weeks. It is not read by the app any more but is your
   original data.

## Backup and rollback

- **Before** any cut-over keep the Blob store as is (it is the backup). To roll back to the Vercel-Blob version of
  the app, redeploy the previous `main` (it still reads Blob); no data copy is needed *unless* data was changed in
  Supabase after the cut-over (those changes would not be in Blob).
- To export Supabase data: Dashboard > SQL editor: `select * from kv_documents;` > download CSV; storage files can be
  downloaded from Storage > investor-documents. Take an export before go-live and periodically (the Free plan has
  no automatic backups).
- Schema changes are additive only; never run destructive SQL against this project while a rollback may be needed.

## Demo data

`npm run seed:demo -- <local|preview|production>` now writes to Supabase (it needs the Supabase variables).
