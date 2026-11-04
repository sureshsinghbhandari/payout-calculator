import "server-only";
import { BlobError, get, put } from "@vercel/blob";
import { easternDay } from "../time";
import {
  getTradingMonth,
  getTradingTabData,
  getTradingToday,
  isMonthKey,
  type TradingResult,
  type TradingTabData,
  type TradingToday,
} from "./trading-api";

/**
 * Saved copies of what the trading app last answered, so the Trading
 * dashboard still shows its figures when that app (or its tunnel, or the PC it
 * runs on) is off.
 *
 * Every successful read is saved as one private JSON file in Vercel Blob,
 * per account and view (`trading/<env>/<slug>/overview.json`,
 * `month-YYYY-MM.json`, `today.json`). When the live read fails, the saved
 * copy is shown instead, marked with the time it was saved. Only the accounts
 * in lib/trading-accounts.ts are ever read or saved by the callers.
 *
 * The month sheets only change once the figures are final, so they are read
 * from the saved copy and refreshed twice a day, at 9:35 AM and 4:01 PM
 * Eastern (REFRESH_TIMES; the cron job does it, and a page view does it when
 * a refresh time has passed and the copy is older). A month that ended before
 * its copy was saved cannot change any more, so that copy is used without
 * calling the other app at all. Today's positions
 * only fall back to a copy saved today: yesterday's open positions would
 * mislead.
 *
 * Saving is best effort: a failure is logged and never breaks the page.
 */

// Production shares one set of files; previews and local development keep their own.
const ENV_FOLDER = process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_ENV || "local";

export function isSnapshotStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

interface Snapshot<T> {
  /** ISO time the copy was saved. */
  savedAt: string;
  data: T;
}

/** A read that may come from the saved copy: `stale` is set when the live app could not be reached. `savedAt` is when the figures were last pulled from the trading app. */
export type Loaded<T> =
  | { ok: true; value: T; stale: null | { savedAt: string; reason: "unreachable" | "final" }; savedAt?: string }
  | { ok: false; error: string; status?: number | null };

const pathFor = (slug: string, name: string) => `trading/${ENV_FOLDER}/${slug}/${name}.json`;

async function readSnapshot<T>(slug: string, name: string): Promise<Snapshot<T> | null> {
  if (!isSnapshotStorageConfigured()) return null;
  try {
    const result = await get(pathFor(slug, name), { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return null;
    const parsed = JSON.parse(await new Response(result.stream).text()) as Snapshot<T>;
    return parsed && typeof parsed.savedAt === "string" && parsed.data ? parsed : null;
  } catch (error) {
    console.error("Reading a saved trading copy failed", error);
    return null;
  }
}

async function writeSnapshot<T>(slug: string, name: string, data: T): Promise<void> {
  if (!isSnapshotStorageConfigured()) return;
  try {
    const snapshot: Snapshot<T> = { savedAt: new Date().toISOString(), data };
    await put(pathFor(slug, name), JSON.stringify(snapshot), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 60,
    });
  } catch (error) {
    if (!(error instanceof BlobError)) console.error("Saving a trading copy failed", error);
    else console.error("Saving a trading copy failed", error.message);
  }
}

/** When the month sheets are refreshed, US Eastern, on weekdays: after the open, and just after the close. */
export const REFRESH_TIMES = [
  { hour: 9, minute: 35 },
  { hour: 16, minute: 1 },
] as const;

const etParts = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/New_York" });

/** The instant of `hour:minute` US Eastern on `day` (YYYY-MM-DD), whichever of EST / EDT applies. */
function easternInstant(day: string, hour: number, minute: number): number {
  const [y, mo, d] = day.split("-").map(Number);
  for (const offset of [4, 5]) {
    const guess = Date.UTC(y, mo - 1, d, hour + offset, minute);
    const parts = Object.fromEntries(etParts.formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
    if (Number(parts.hour) === hour && Number(parts.minute) === minute) return guess;
  }
  return Date.UTC(y, mo - 1, d, hour + 5, minute);
}

/** The most recent scheduled refresh time (weekdays only) that is not after `now`. */
export function lastScheduledRefresh(now: Date = new Date()): Date {
  let best = 0;
  for (let back = 0; back <= 5 && best === 0; back++) {
    const day = easternDay(new Date(now.getTime() - back * 86_400_000).toISOString());
    const [y, mo, d] = day.split("-").map(Number);
    const weekday = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    for (const { hour, minute } of REFRESH_TIMES) {
      const at = easternInstant(day, hour, minute);
      if (at <= now.getTime() && at > best) best = at;
    }
  }
  return new Date(best);
}

/** The current month (YYYY-MM) in US Eastern Time. */
export function currentMonthKey(now: Date = new Date()): string {
  return easternDay(now.toISOString()).slice(0, 7);
}

/** Months newest first, without repeats. */
function mergeMonths(...lists: (string[] | undefined)[]): string[] {
  return [...new Set(lists.flatMap((list) => list ?? []))].sort().reverse();
}

/** Overview (KPI tiles and strategies): live, saved on success, the saved copy when the app is unreachable. */
export async function loadOverview(slug: string): Promise<Loaded<TradingTabData>> {
  const live = await getTradingTabData(slug);
  if (live.ok) {
    await writeSnapshot(slug, "overview", live.value);
    return { ok: true, value: live.value, stale: null };
  }
  return fallback(slug, "overview", live);
}

/**
 * One month sheet. A past month whose copy was saved after the month ended is
 * final and served without calling the other app. Any other month is served
 * from its saved copy until the next refresh time (9:35 AM / 4:01 PM Eastern)
 * has passed; after that, live first, saved on success, the older saved copy
 * on failure. `month` null = the current month.
 */
export async function loadMonth(slug: string, month: string | null): Promise<Loaded<TradingTabData>> {
  const current = currentMonthKey();
  const wanted = isMonthKey(month) ? month : current;
  const saved = await readSnapshot<TradingTabData>(slug, `month-${wanted}`);
  const usable = saved && saved.data.month ? saved : null;

  if (usable) {
    const fresh = () => (wanted === current ? usable.data : withFreshMonthList(slug, usable.data));
    // A past month saved after it ended cannot change any more.
    if (wanted < current && currentMonthKey(new Date(usable.savedAt)) > wanted) {
      return { ok: true, value: await fresh(), stale: { savedAt: usable.savedAt, reason: "final" }, savedAt: usable.savedAt };
    }
    // Otherwise the copy is current until the next scheduled refresh time passes.
    if (Date.parse(usable.savedAt) >= lastScheduledRefresh().getTime()) {
      return { ok: true, value: await fresh(), stale: null, savedAt: usable.savedAt };
    }
  }

  const live = await getTradingMonth(slug, month);
  if (live.ok && live.value.month) {
    await writeSnapshot(slug, `month-${live.value.month.month}`, live.value);
    return { ok: true, value: live.value, stale: null, savedAt: new Date().toISOString() };
  }
  if (live.ok) return { ok: true, value: live.value, stale: null };

  if (live.status !== null) return live; // a refusal (token, bad request, missing route) must be seen as such
  if (usable) {
    return { ok: true, value: await withFreshMonthList(slug, usable.data), stale: { savedAt: usable.savedAt, reason: "unreachable" }, savedAt: usable.savedAt };
  }
  return withNoCopyNote(live);
}

/** A saved month's list of months can miss newer months; add the ones the latest saved current month knows about, and the current month itself. */
async function withFreshMonthList(slug: string, data: TradingTabData): Promise<TradingTabData> {
  if (!data.month) return data;
  const latest = await readSnapshot<TradingTabData>(slug, `month-${currentMonthKey()}`);
  const available = mergeMonths(data.month.available, latest?.data.month?.available, [data.month.month, currentMonthKey()]);
  return { ...data, month: { ...data.month, available } };
}

/** Today's positions: live, saved on success; when the app is unreachable only a copy saved today is shown. */
export async function loadToday(slug: string): Promise<Loaded<TradingToday>> {
  const live = await getTradingToday(slug);
  if (live.ok) {
    await writeSnapshot(slug, "today", live.value);
    return { ok: true, value: live.value, stale: null };
  }
  // A refusal (including "the other app does not have this yet") is not an outage.
  if (live.status !== null) return live;
  const saved = await readSnapshot<TradingToday>(slug, "today");
  if (saved && easternDay(saved.savedAt) === easternDay(new Date().toISOString())) {
    return { ok: true, value: saved.data, stale: { savedAt: saved.savedAt, reason: "unreachable" } };
  }
  return live;
}

type Failure = Extract<TradingResult<unknown>, { ok: false }>;

/** The outage message plus a note that there is no saved copy to show instead (yet). */
function withNoCopyNote(failed: Failure): Failure {
  return {
    ...failed,
    error: `${failed.error} No saved copy exists yet. Start the trading app once and run npm run trading:sync in this project, or open this page while the app is reachable, to save one.`,
  };
}

async function fallback<T>(slug: string, name: string, failed: Failure): Promise<Loaded<T>> {
  // Only an outage (no answer) falls back; a refused token or a missing tab must be seen as such.
  if (failed.status !== null) return failed;
  const saved = await readSnapshot<T>(slug, name);
  if (saved) return { ok: true, value: saved.data, stale: { savedAt: saved.savedAt, reason: "unreachable" } };
  return withNoCopyNote(failed);
}

/**
 * Pulls and saves the numbers of one account (Overview, the current and the
 * previous month) without showing anything. Used by the daily job after the
 * close. With `everything`, also every other month the trading app has and
 * today's positions: used by the one-time sync (npm run trading:sync) that
 * fills the saved copies from the start. Returns what could and could not be
 * saved.
 */
export async function refreshSnapshots(
  slug: string,
  options: { everything?: boolean } = {},
): Promise<{ slug: string; saved: string[]; failed: string[] }> {
  const saved: string[] = [];
  const failed: string[] = [];
  const current = currentMonthKey();
  const [year, month] = current.split("-").map(Number);
  const previous = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;

  const overview = await getTradingTabData(slug);
  if (overview.ok) {
    await writeSnapshot(slug, "overview", overview.value);
    saved.push("overview");
  } else failed.push("overview");

  const queued = new Set<string>([current, previous]);
  const pending = [current, previous];
  while (pending.length > 0) {
    const key = pending.shift() as string;
    const sheet = await getTradingMonth(slug, key);
    if (sheet.ok && sheet.value.month) {
      await writeSnapshot(slug, `month-${sheet.value.month.month}`, sheet.value);
      saved.push(`month-${sheet.value.month.month}`);
      if (options.everything) {
        for (const other of sheet.value.month.available ?? []) {
          if (isMonthKey(other) && !queued.has(other)) {
            queued.add(other);
            pending.push(other);
          }
        }
      }
    } else failed.push(`month-${key}`);
  }

  if (options.everything) {
    const today = await getTradingToday(slug);
    if (today.ok) {
      await writeSnapshot(slug, "today", today.value);
      saved.push("today");
    } else failed.push("today");
  }
  return { slug, saved, failed };
}
