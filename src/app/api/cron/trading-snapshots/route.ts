import { connection } from "next/server";
import { TRADING_ACCOUNTS } from "@/lib/trading-accounts";
import { isCronRequestAuthorized } from "@/lib/server/payout-notices";
import { isSnapshotStorageConfigured, REFRESH_TIMES, refreshSnapshots } from "@/lib/server/trading-snapshots";
import { isTradingApiConfigured } from "@/lib/server/trading-api";

/**
 * Twice-a-day job that saves a copy of the Trading dashboard's figures
 * (Overview and the current and previous month sheet of each account) at
 * 9:35 AM and 4:01 PM Eastern on weekdays. The Monthly sheet is served from
 * these copies in between, and they keep the dashboard showing figures when
 * the trading app is off. Called by Vercel Cron (vercel.json). Vercel sends
 * "Authorization: Bearer <CRON_SECRET>"; any other request, and every request
 * while CRON_SECRET is not set, is refused.
 *
 * Cron schedules are in UTC and know nothing about daylight saving, so
 * vercel.json lists both UTC times of each (13:35 / 14:35 and 20:01 / 21:01)
 * and this route does the work only during the 9 AM or 4 PM hour Eastern (one
 * of each pair always falls in it). On Vercel's free (Hobby) plan a cron job
 * runs at some point within its hour rather than at the minute, so the whole
 * hour is accepted; on Pro it runs at the minute. A page view refreshes a copy
 * that is older than the last scheduled time, so an early or missed run heals.
 */
export const maxDuration = 60;

const clockFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/New_York",
});

/** True from 9:00 to 9:59 and from 16:00 to 16:59 US Eastern, the hours of REFRESH_TIMES. */
function isRefreshHour(now: Date): boolean {
  const parts = Object.fromEntries(clockFormatter.formatToParts(now).map((p) => [p.type, p.value]));
  return REFRESH_TIMES.some((time) => time.hour === Number(parts.hour));
}

export async function GET(request: Request): Promise<Response> {
  // Always per request: never prerendered at build time.
  await connection();
  if (!isCronRequestAuthorized(request.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isRefreshHour(new Date())) {
    return Response.json({ skipped: "Not the 9 AM or 4 PM hour Eastern; the other scheduled hour handles this season." });
  }
  if (!isTradingApiConfigured()) return Response.json({ skipped: "TRADING_API_URL and TRADING_API_TOKEN are not set." });
  if (!isSnapshotStorageConfigured()) return Response.json({ skipped: "Blob storage is not set up." });

  const results = [];
  for (const account of TRADING_ACCOUNTS) results.push(await refreshSnapshots(account.slug));
  return Response.json({ ok: true, results });
}
