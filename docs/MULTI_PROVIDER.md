# Multi-provider hosting

One codebase, one `main` branch, one shared Supabase project. Three places it can run:

| Role | Provider | Config | Scheduler |
|---|---|---|---|
| Primary | Vercel | `vercel.json` | Vercel Cron |
| Backup 1 | Netlify | `netlify.toml`, `netlify/functions/` | Netlify scheduled functions |
| Backup 2 | Cloudflare Workers | `wrangler.jsonc`, `cloudflare/worker.ts`, `open-next.config.ts` | Cron Triggers |

```
          One Git repository / one commit
                      |
        npm run deploy -- --provider=<one>
                      |
     Vercel      or   Netlify     or   Cloudflare     (only the one you name)
        \               |               /
         +--------- Supabase ----------+
              PostgreSQL + private Storage
```

**Manual, sequential failover.** Exactly one provider serves the live domain. Nothing here switches DNS or
providers automatically, and nothing deploys to all three at once.

## Keeping the idle providers silent

Idle providers cost nothing as long as:

1. **Nothing builds by itself.** Do not connect the Git repository to Netlify or Cloudflare; deploy them only with
   the command below. On Vercel, switch off Git deployments for the project (Project > Settings > Git >
   "Ignored Build Step" = `exit 0`, or disconnect the repo) when Vercel is not the live provider.
2. **No traffic reaches them.** The live domain points at one provider; the others are only used on their own
   `*.vercel.app` / `*.netlify.app` / `*.workers.dev` address when you test.
3. **Their schedules are off.** Set `PROVIDER_ACTIVE=false` on an idle provider: its scheduled jobs return at once
   without touching Supabase or sending email. Then, to stop the invocations completely, disable the schedule too
   (see "Cron" below).

`PROVIDER_ACTIVE` is the only provider-dependent switch in the app. `APP_ENV`, `DEPLOY_PROVIDER` and the health
check are for diagnostics and data-set selection, not business logic.

## Deploy commands

```bash
npm run deploy -- --provider=vercel
npm run deploy -- --provider=netlify
npm run deploy -- --provider=cloudflare
# shortcuts
npm run deploy:vercel
npm run deploy:netlify
npm run deploy:cloudflare
```

Each command: validates the provider; requires a clean working tree (so a deployment is exactly one commit); checks
the provider CLI login/link; runs `typecheck`, `lint`, `test`; builds with that provider's configuration;
deploys **only** that provider; then calls `/api/health` on the new URL and prints provider, commit, URL and health.
It stops on the first failure and never reports success for an unhealthy deployment. It never changes DNS.

`--url=https://...` supplies the address to health-check if the CLI does not print one.
CLI versions are pinned in `scripts/deploy.mjs`.

**Cloudflare needs Linux** to build (the adapter creates symbolic links). On Windows use the manual GitHub Action
(Actions > "Deploy one provider" > Run workflow > cloudflare) or turn on Windows Developer Mode. The workflow
never runs on its own.

## Environment variables

See `.env.example` (all names, with descriptions). Set the same values on every provider you may use:

- Required everywhere: `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `CRON_SECRET`, `SITE_URL`, `APP_ENV=production`.
- Optional: email (`EMAIL_*`, `GMAIL_*`, `RESEND_*`), trading (`TRADING_API_*`), `SUPABASE_PUBLISHABLE_KEY`.
- `ADMIN_SESSION_SECRET` must be **identical** on all providers (it signs sessions and encrypts two-step secrets
  and bank details); otherwise people are signed out and encrypted data is unreadable after a switch.

The service-role key is server-only. Never create a `NEXT_PUBLIC_` variable for it.

### Vercel
Project > Settings > Environment Variables (Production). `APP_ENV` may stay empty (Vercel's `VERCEL_ENV` is used).
Link once with `npx vercel link`.

### Netlify
1. `npx netlify-cli login`, then `npx netlify-cli init` **without** connecting a Git repository (manual deploys).
2. Site settings > Environment variables: add the list above (secrets marked secret). `netlify.toml` already
   sets `DEPLOY_PROVIDER`, `APP_ENV`, `PROVIDER_ACTIVE` for the production context.
3. `npm run deploy:netlify`.

### Cloudflare Workers
1. `npx wrangler login`.
2. Secrets, one by one (`npx wrangler secret put NAME`): `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`,
   `ADMIN_SESSION_SECRET`, `CRON_SECRET`, and any email keys. Non-secret values (`SUPABASE_URL`, `SITE_URL`, ...)
   go in the `vars` block of `wrangler.jsonc` or the dashboard.
3. `npm run deploy:cloudflare` (on Linux / the GitHub Action).

## Cron

Both jobs are routes in the app (`/api/cron/payout-notices`, `/api/cron/trading-snapshots`), protected by
`Authorization: Bearer <CRON_SECRET>`. Each provider's scheduler only calls them, on the same UTC schedule:

| Job | UTC | |
|---|---|---|
| payout-notices | `0 13 * * *` | daily |
| trading-snapshots | `35 13`, `35 14`, `1 20`, `1 21` (`* * 1-5`) | the route itself only works in the 9 AM / 4 PM Eastern hour |

**Duplicate protection.** Every run takes a lock in Supabase (`job_try_lock`, table `job_locks`). If two providers
fire at the same time, the second is skipped. The payout reminders also record what was already sent, and a
paused provider (`PROVIDER_ACTIVE=false`) skips immediately.

**When switching, to avoid two providers' schedules:**
- Vercel: crons are defined in `vercel.json` and run for production deployments. To stop them, remove the `crons`
  block (or the project's production deployment) in a commit you deploy, or set `PROVIDER_ACTIVE=false`.
- Netlify: Functions > the `cron-*` functions > disable, or delete the site deployment's scheduled functions; or
  set `PROVIDER_ACTIVE=false`.
- Cloudflare: Workers > payout-calculator > Settings > Triggers > remove the cron triggers, or
  `PROVIDER_ACTIVE=false`.

## Health check

`GET /api/health` returns `{status, provider, active, dataSet, config, database, storage, commit}`; HTTP 200 when
everything is `ok`, 503 otherwise. No secrets or error details are returned (they are logged on the server).
It only reads.

## Switching the live provider (e.g. Vercel -> Netlify)

1. Confirm the live commit (`/api/health` -> `commit`) and that Supabase is healthy.
2. `npm run deploy:netlify` (same commit). Make sure the same environment variables are set there.
3. Open the Netlify address: `/api/health` is `ok`; sign in as admin; open an investor, an inquiry, the calculator,
   a document download, send a test email, "Run now" on Settings > Email.
4. Lower the DNS TTL on the domain a day ahead (300 seconds).
5. Set `PROVIDER_ACTIVE=false` on the old provider and `true` on the new one; disable the old schedule, enable the new.
6. Add the domain to the new provider (domain verification and TLS certificate are issued by the provider; wait for
   "certificate ready"), then change the DNS record (CNAME/A) to the new provider.
7. DNS is not instant: old and new can both serve for up to the TTL (and longer in some resolvers). Both use the same
   Supabase data, so either answer is correct. Verify the public domain and the key flows.
8. Keep the old deployment (and Supabase) untouched until the new one has been stable for a while.

For Cloudflare, the same steps apply with `deploy:cloudflare`; if the domain's DNS is already on Cloudflare, add a
custom domain to the Worker instead of editing a record.

## Rollback

```
New provider active -> problem
   -> check the old deployment still answers (/api/health) and Supabase is healthy
   -> point DNS back to the old provider (TTL applies)
   -> PROVIDER_ACTIVE=true on the old, false on the new; move the schedule back
   -> verify health and key flows
```
No data is copied in either direction: both use the same Supabase. Database changes are additive only, so the
previous deployment keeps working; never apply a destructive schema change while a rollback might be needed.

## Known limitations and what is not verified

- **Cloudflare + Gmail:** Gmail sending/receiving uses SMTP/IMAP (raw TCP), not available on Workers. Use Resend
  (`EMAIL_PROVIDER=resend`) on Cloudflare.
- **Cloudflare size limits:** the Free plan allows 3 MiB per Worker (10 MiB paid). The Next.js + Excel + PDF bundle
  may exceed the free limit; this must be checked on the first real build.
- **`"use cache: remote"`** (rates, amounts and terms): on Vercel it is backed by Vercel's remote cache. Netlify and
  Cloudflare have no equivalent configured here, so cached values may stay stale for a short time on those
  providers after an admin saves new rates. Verify this on each provider before relying on it (see DEPLOYMENT.md).
- **Sign-in rate limiting** is in memory per server instance, so it is weaker on serverless providers than a single
  server; add a platform firewall rule on the live provider.
- **Next.js adapters:** Netlify uses `@netlify/plugin-nextjs` (runtime v5); Cloudflare uses `@opennextjs/cloudflare`
  1.20.x, which requires Next.js >= 16.4.5 (this branch uses 16.4.5). Next.js documents that verified Cloudflare and
  Netlify adapters are still being built, so re-check compatibility when upgrading Next.js.
- Vercel Analytics / Speed Insights load only on Vercel.
