import { connection } from "next/server";
import { isCronRequestAuthorized, runPayoutReminders } from "@/lib/server/payout-notices";
import { siteOrigin } from "@/lib/server/site-url";

/**
 * Daily payout reminder job, called by Vercel Cron (vercel.json). Vercel sends
 * "Authorization: Bearer <CRON_SECRET>"; any other request, and every request
 * while CRON_SECRET is not set, is refused. Master Admins can run the same job
 * with Run now on Settings > Email.
 */
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  // Always per request: never prerendered at build time.
  await connection();
  if (!isCronRequestAuthorized(request.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const run = await runPayoutReminders({ kind: "schedule" }, siteOrigin(request.headers));
  return Response.json(run);
}
