# Supabase

All three hosting providers use the same Supabase project (`payout-calculator`, region us-east-1, free plan).
The old "Arthalekha" project on the same account is unrelated and is not used or modified.

## What was created

Migration `object_store_and_job_locks` (additive; nothing is dropped):

| Object | Purpose |
|---|---|
| `public.kv_documents` (`path` PK, `body` text, `version` bigint, timestamps) | Every JSON document the app used to keep in Vercel Blob. `path` keeps the old pathname (e.g. `accounts/production/investors.json`), so data moves 1:1. `body` is text so content stays byte-for-byte what the app wrote. `version` replaces the Blob ETag. |
| `public.kv_put(path, body, expected_version, allow_overwrite)` | Atomic compare-and-set. Returns `ok` or `conflict`. This keeps the existing "read, change, write only if unchanged, retry" behaviour of every store. |
| `public.job_locks`, `job_try_lock`, `job_unlock` | Stops a scheduled job running twice at once across providers. |
| Storage bucket `investor-documents` | **Private**; PDF/JPEG/PNG only; 10 MB limit. Investor documents. |

## Why a document table (not normalized tables)

The existing stores treat each file as one JSON document with optimistic concurrency. Moving that exactly keeps
every payout, interest, balance, auth and audit rule unchanged and gets you running now. Normalizing into relational
tables (investors, investments, payouts, ...) can follow one store at a time, behind the same store functions,
with the migration script's reconciliation as a safety net. Indexes: the primary key on `path` serves every read and
the prefix `list` (range scan).

## Security

- Row Level Security is **on** for both tables with **no policies**: the anon/authenticated keys can read and write
  nothing. Only the server, using the service-role key, can (the service role bypasses RLS). Supabase's advisor
  reports this as an INFO note ("RLS enabled, no policy"), which is intended.
- Function execution is revoked from `public`, `anon` and `authenticated` and granted to `service_role` only.
- The bucket is private and has no storage policies; files are only served by the app's routes that check who is
  asking (`/portal/documents/...`, `/admin/investors/.../documents/...`). Uploads use a signed URL for one exact
  path, issued only to a signed-in Master Admin.
- `SUPABASE_SERVICE_ROLE_KEY` is read only in `src/lib/server/object-store.ts` (`server-only`). Never expose it to
  the browser or in a `NEXT_PUBLIC_` variable.

## Setup from scratch (a new project)

1. Create a project; copy the Project URL and the **service_role / secret** key (Project Settings > API).
2. Run the migration SQL (it is recorded in the Supabase project's migration history; the same SQL is in
   `supabase/migrations/`) in the SQL editor.
3. Put `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` and in every provider.
4. Check: `npm run dev`, then open `/api/health`.

## Free-plan notes

500 MB database, 1 GB file storage, 50 MB max file; projects pause after 7 days without activity (a daily cron
call keeps it active; pausing is recoverable from the dashboard). Back up before go-live (Dashboard > Database >
Backups is not included on Free; use the export in DATA_MIGRATION.md).
