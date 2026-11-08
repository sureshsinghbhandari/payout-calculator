# Deployment guide

Short version: [MULTI_PROVIDER.md](MULTI_PROVIDER.md) explains the architecture, commands, cron, DNS switching and
rollback; [SUPABASE.md](SUPABASE.md) the database and storage; [DATA_MIGRATION.md](DATA_MIGRATION.md) the move from
Vercel Blob. This page is the checklist and the troubleshooting list.

## Local development

```bash
npm install
cp .env.example .env.development.local      # fill in ADMIN_*, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
npm run dev                                  # data set "local" (empty); open http://localhost:3000/api/health
```

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
(Cloudflare build: `npm run build:cloudflare`, Linux only).

## First deployment checklist (any provider)

1. Environment variables set (see `.env.example`), including `APP_ENV=production` on the live provider.
2. `npm run deploy -- --provider=<name>`: all checks green, deployment URL printed, health `ok`.
3. On that URL: admin sign-in, investor page, document upload and download, inquiry, calculator, rates page,
   email test, Settings > Email > Run now.
4. Cron: only the live provider has an enabled schedule (and `PROVIDER_ACTIVE=true`).

## What was verified on this branch (local machine)

- Typecheck, lint, the 274 existing unit tests and `next build` (Next.js 16.4.5): pass.
- Database functions (`kv_put` compare-and-set, `job_try_lock`) tested directly against the Supabase project.
- NOT verified yet: the app running against Supabase end to end (needs the service-role key), Vercel / Netlify /
  Cloudflare deployments, the browser direct upload to Storage, and the Cloudflare and Netlify builds. The
  Cloudflare build cannot complete on native Windows (symlink permission). Do not treat a provider as ready until
  its `npm run deploy` report shows a healthy `/api/health` and the checklist above passes.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `/api/health` -> `config: missing` | `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` not set on that provider. |
| `database: fail` / `storage: fail` | Wrong URL/key, or the project is paused (resume it in the Supabase dashboard). Details are in the server logs. |
| Site is empty / no accounts after deploying to a new provider | `APP_ENV` is not `production` there, so it reads the empty `local` data set. |
| Everyone signed out after a switch | `ADMIN_SESSION_SECRET` differs between providers. |
| Emails fail on Cloudflare | Gmail (SMTP/IMAP) is unavailable on Workers; use `EMAIL_PROVIDER=resend`. |
| Rates look stale for a moment after saving on Netlify/Cloudflare | `"use cache: remote"` has no shared cache there; see MULTI_PROVIDER.md limitations. |
| `deploy` says uncommitted changes | Commit first; a deployment must be one exact commit. |
| Scheduled job reports `skipped` | `PROVIDER_ACTIVE=false`, or another provider's run holds the lock. |
| Cloudflare build fails with `EPERM ... symlink` | Windows; use the GitHub Action or enable Developer Mode. |
