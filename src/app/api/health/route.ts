import { connection } from "next/server";
import { APP_ENV } from "@/lib/server/app-env";
import { checkStore, isObjectStoreConfigured } from "@/lib/server/object-store";
import { currentProvider, isProviderActive } from "@/lib/server/provider";

/**
 * Health check for deployments and the deploy script: GET /api/health.
 * Reports only ok/fail per part, never secrets, record contents or error details
 * (those are logged on the server). 200 when everything is ok, 503 otherwise.
 * It only reads: it never writes or changes anything.
 */
export async function GET(): Promise<Response> {
  await connection();
  const config = Boolean(
    process.env.ADMIN_SESSION_SECRET && process.env.ADMIN_PASSWORD && isObjectStoreConfigured(),
  );
  let database = false;
  let storage = false;
  if (isObjectStoreConfigured()) {
    try {
      ({ database, storage } = await checkStore());
    } catch (error) {
      console.error("Health check: storage check failed", error);
    }
  }
  const ok = config && database && storage;
  return Response.json(
    {
      status: ok ? "ok" : "degraded",
      provider: currentProvider(),
      active: isProviderActive(),
      dataSet: APP_ENV,
      config: config ? "ok" : "missing",
      database: database ? "ok" : "fail",
      storage: storage ? "ok" : "fail",
      commit: (process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_REF || process.env.APP_COMMIT || "").slice(0, 7) || null,
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
