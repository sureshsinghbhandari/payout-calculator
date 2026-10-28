/**
 * Meetings scheduled during a call or note: when it is, in the time zone the
 * admin entered it in. Pure helpers shared by the forms, the pages and the
 * stored format.
 */

/** A scheduled meeting: an instant (ISO, UTC) and the IANA time zone it was entered in. */
export interface Meeting {
  at: string;
  zone: string;
}

/** A meeting kept on an inquiry, with the name of the admin who scheduled it. */
export interface InquiryMeeting extends Meeting {
  by: string;
}

/** Latest a meeting can be scheduled. */
const MAX_AHEAD_MS = 2 * 365 * 86_400_000;
/** A meeting counts as upcoming until half an hour after it starts. */
const UPCOMING_GRACE_MS = 30 * 60_000;
/** Allowance for a clock a few minutes behind when checking "in the future". */
const PAST_TOLERANCE_MS = 5 * 60_000;

export function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone.length <= 64;
  } catch {
    return false;
  }
}

function validInstant(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

/** Reads a stored meeting; anything malformed is ignored. */
export function parseMeeting(raw: unknown): Meeting | undefined {
  const d = (raw ?? null) as Record<string, unknown> | null;
  if (!d || !validInstant(d.at)) return undefined;
  const zone = typeof d.zone === "string" && isTimeZone(d.zone) ? d.zone : "UTC";
  return { at: new Date(d.at).toISOString(), zone };
}

/**
 * Validates the meeting fields of a form: `at` is the instant (ISO) the
 * browser worked out from the date and time the admin picked, `zone` the
 * browser's time zone. Must be in the future and within two years.
 */
export function parseMeetingInput(
  rawAt: unknown,
  rawZone: unknown,
  nowMs: number,
): { ok: true; meeting: Meeting } | { ok: false; error: string } {
  if (!validInstant(rawAt)) return { ok: false, error: "Choose the meeting date and time." };
  const at = Date.parse(rawAt);
  if (at < nowMs - PAST_TOLERANCE_MS) return { ok: false, error: "The meeting must be in the future." };
  if (at > nowMs + MAX_AHEAD_MS) return { ok: false, error: "The meeting can be at most two years ahead." };
  const zone = typeof rawZone === "string" && isTimeZone(rawZone) ? rawZone : "UTC";
  return { ok: true, meeting: { at: new Date(at).toISOString(), zone } };
}

/** Whether the meeting is still to come (or has only just started). */
export function isMeetingUpcoming(meeting: Meeting, nowMs: number = Date.now()): boolean {
  return Date.parse(meeting.at) + UPCOMING_GRACE_MS >= nowMs;
}

/**
 * The meeting as text: the time in the zone it was entered in ("Wed, Nov 5,
 * 2026, 2:00 PM EST"), and the same instant in UTC when that is a different
 * time zone (the rest of the app shows UTC).
 */
export function formatMeeting(meeting: Meeting): { local: string; utc: string | null } {
  const date = new Date(meeting.at);
  const local = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: meeting.zone,
    timeZoneName: "short",
  }).format(date);
  if (meeting.zone === "UTC") return { local, utc: null };
  const utc = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
  return { local, utc: `${utc} UTC` };
}
