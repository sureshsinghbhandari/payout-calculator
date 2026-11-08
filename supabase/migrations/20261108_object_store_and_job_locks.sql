-- Payout Calculator: shared persistence for every hosting provider.
-- Additive only; nothing here drops or rewrites existing objects.
-- Applied to the "payout-calculator" Supabase project as migration `object_store_and_job_locks`.

-- JSON documents (previously one private Vercel Blob file each). `path` keeps the
-- old blob pathname, so data moves 1:1. `body` is stored as text so the stored
-- content stays byte-for-byte what the app wrote. `version` replaces the blob ETag.
create table if not exists public.kv_documents (
  path       text primary key,
  body       text   not null,
  version    bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Server-only table: RLS on and no policies, so anon/authenticated keys can read
-- or write nothing. The server uses the service-role key, which bypasses RLS.
alter table public.kv_documents enable row level security;
revoke all on table public.kv_documents from anon, authenticated;

-- Atomic compare-and-set write. Returns 'ok' or 'conflict'.
--   p_expected_version not null : overwrite only that exact version
--   p_expected_version null, p_allow_overwrite true  : unconditional upsert
--   p_expected_version null, p_allow_overwrite false : create only if missing
create or replace function public.kv_put(
  p_path text,
  p_body text,
  p_expected_version bigint,
  p_allow_overwrite boolean
) returns text
language plpgsql
set search_path = public
as $$
declare
  n integer;
begin
  if p_expected_version is not null then
    update kv_documents
       set body = p_body, version = version + 1, updated_at = now()
     where path = p_path and version = p_expected_version;
    get diagnostics n = row_count;
    return case when n = 1 then 'ok' else 'conflict' end;
  elsif p_allow_overwrite then
    insert into kv_documents (path, body) values (p_path, p_body)
    on conflict (path) do update
      set body = excluded.body, version = kv_documents.version + 1, updated_at = now();
    return 'ok';
  else
    insert into kv_documents (path, body) values (p_path, p_body)
    on conflict (path) do nothing;
    get diagnostics n = row_count;
    return case when n = 1 then 'ok' else 'conflict' end;
  end if;
end;
$$;

revoke all on function public.kv_put(text, text, bigint, boolean) from public, anon, authenticated;
grant execute on function public.kv_put(text, text, bigint, boolean) to service_role;

-- Job locks: stops the same scheduled job running twice at once, e.g. while two
-- providers both still have a schedule during a switch-over.
create table if not exists public.job_locks (
  name         text primary key,
  locked_until timestamptz not null default 'epoch',
  locked_by    text,
  last_run_at  timestamptz
);
alter table public.job_locks enable row level security;
revoke all on table public.job_locks from anon, authenticated;

-- Takes the lock when it is free or expired. Returns true if this caller got it.
create or replace function public.job_try_lock(p_name text, p_ttl_seconds integer, p_owner text)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  n integer;
begin
  insert into job_locks (name, locked_until, locked_by, last_run_at)
  values (p_name, now() + make_interval(secs => p_ttl_seconds), p_owner, now())
  on conflict (name) do update
    set locked_until = excluded.locked_until, locked_by = excluded.locked_by, last_run_at = excluded.last_run_at
    where job_locks.locked_until <= now();
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

create or replace function public.job_unlock(p_name text, p_owner text)
returns void
language sql
set search_path = public
as $$
  update job_locks set locked_until = 'epoch' where name = p_name and locked_by = p_owner;
$$;

revoke all on function public.job_try_lock(text, integer, text) from public, anon, authenticated;
revoke all on function public.job_unlock(text, text) from public, anon, authenticated;
grant execute on function public.job_try_lock(text, integer, text) to service_role;
grant execute on function public.job_unlock(text, text) to service_role;

-- Private bucket for investor documents (PDF/JPEG/PNG, 10 MB). No storage policies
-- are created, so only the server (service-role key) can touch the files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('investor-documents', 'investor-documents', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;
