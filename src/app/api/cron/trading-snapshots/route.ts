import { connection } from "next/server";
import { TRADING_ACCOUNTS } from "@/lib/trading-accounts";
import { isCronRequestAuthorized } from "@/lib/server/payout-notices";
import { isSnapshotStorageConfigured, refreshSnapshots } from "@/lib/server/trading-snapshots";
import { isTradingApiConfigured } from "@/lib/server/trading-api";

/**
 * Daily job that saves a copy of the Trading dashboard's figures (Overview and
 * the current and previous month sheet of each account) right after the US
 * market closes, at 4:01 PM Eastern, so the dashboard keeps showing them when
 * the trading app is off. Called by Vercel Cron (vercel.json). Vercel sends
 * "Authorization: Bearer <CRON_SECRET>"; any other request, and every request
 * while CRON_SECRET is not set, is refused.
 *
 * Cron schedules are in UTC and know nothing about daylight saving, so
 * vercel.json lists both 20:01 and 21:01 UTC on weekdays and this route does
 * the work only when it is 16:00-16:29 Eastern (one of the two always is).
 */
export const maxDuration = 60;

const clockFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/New_York",
});

/** True from 16:00 to 16:29 US Eastern. */
function isJustAfterClose(now: Date): boolean {
  const parts = Object.fromEntries(clockFormatter.formatToParts(now).map((p) => [p.type, p.value]));
  return Number(parts.hour) === 16 && Number(parts.minute) < 30;
}

export async function GET(request: Request): Promise<Response> {
  // Always per request: never prerendered at build time.
  await connection();
  if (!isCronRequestAuthorized(request.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isJustAfterClose(new Date())) {
    return Response.json({ skipped: "Not 4:01 PM Eastern; the other scheduled hour handles this season." });
  }
  if (!isTradingApiConfigured()) return Response.json({ skipped: "TRADING_API_URL and TRADING_API_TOKEN are not set." });
  if (!isSnapshotStorageConfigured()) return Response.json({ skipped: "Blob storage is not set up." });

  const results = [];
  for (const account of TRADING_ACCOUNTS) results.push(await refreshSnapshots(account.slug));
  return Response.json({ ok: true, results });
}
