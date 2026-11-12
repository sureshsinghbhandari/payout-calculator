import "server-only";
import { randomBytes } from "node:crypto";
import { isObjectStoreConfigured, supabaseAdmin } from "./object-store";
import { currentProvider, isProviderActive } from "./provider";

const OWNER = `${currentProvider()}-${randomBytes(4).toString("hex")}`;

/**
 * Runs a scheduled job at most once at a time across every hosting provider:
 *  - a paused deployment (PROVIDER_ACTIVE=false) skips the job at once;
 *  - otherwise it takes a lock in Supabase (table job_locks), so a second trigger, for example from
 *    the old provider's schedule during a switch-over, is skipped instead of running the job twice;
 *  - the lock also expires on its own after `ttlSeconds`, so a crashed run never blocks the job.
 * Returns what the job returned, or `{ skipped: "<reason>" }`.
 */
export async function runExclusive<T>(
  name: string,
  ttlSeconds: number,
  job: () => Promise<T>,
): Promise<T | { skipped: string }> {
  if (!isProviderActive()) return { skipped: "This deployment is paused (PROVIDER_ACTIVE=false)." };
  // Without storage the jobs cannot do anything useful; let them report that themselves.
  if (!isObjectStoreConfigured()) return job();

  const db = supabaseAdmin();
  const { data, error } = await db.rpc("job_try_lock", { p_name: name, p_ttl_seconds: ttlSeconds, p_owner: OWNER });
  if (error) throw new Error(`Taking the ${name} job lock failed: ${error.message}`);
  if (data !== true) return { skipped: "The same job is already running (or just ran) elsewhere." };
  try {
    return await job();
  } finally {
    await db.rpc("job_unlock", { p_name: name, p_owner: OWNER }).then(
      ({ error: unlockError }) => {
        if (unlockError) console.error(`Releasing the ${name} job lock failed`, unlockError.message);
      },
      (unlockError) => console.error(`Releasing the ${name} job lock failed`, unlockError),
    );
  }
}
