/**
 * Cloudflare Workers entry point. The app itself is the worker that OpenNext generates
 * (`npm run build:cloudflare` writes .open-next/worker.js); this file only adds the scheduled
 * (cron) handler, which calls the same /api/cron/* routes Vercel Cron and Netlify call. The job
 * logic lives in the app (src/app/api/cron/*, src/lib/server/job-guard.ts), not here.
 */
import openNextWorker from "../.open-next/worker.js";

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "../.open-next/worker.js";

interface Env {
  CRON_SECRET?: string;
  SITE_URL?: string;
  PROVIDER_ACTIVE?: string;
  [key: string]: unknown;
}

/** Which job each cron expression (see wrangler.jsonc) triggers. */
const JOBS: Record<string, string> = {
  "0 13 * * *": "/api/cron/payout-notices",
  "35 13 * * 1-5": "/api/cron/trading-snapshots",
  "35 14 * * 1-5": "/api/cron/trading-snapshots",
  "1 20 * * 1-5": "/api/cron/trading-snapshots",
  "1 21 * * 1-5": "/api/cron/trading-snapshots",
};

const worker = {
  fetch: openNextWorker.fetch,

  async scheduled(controller: { cron: string }, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    const path = JOBS[controller.cron];
    if (!path || !env.CRON_SECRET || env.PROVIDER_ACTIVE === "false") return;
    const origin = (env.SITE_URL || "").replace(/\/$/, "") || "https://cron.invalid";
    const request = new Request(`${origin}${path}`, { headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
    ctx.waitUntil(openNextWorker.fetch(request, env, ctx));
  },
};

export default worker;
