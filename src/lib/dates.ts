/**
 * Calendar-date helpers. Dates are plain "YYYY-MM-DD" strings and all
 * arithmetic is done in UTC, so results never shift with the visitor's time zone.
 */

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

function fromUtc(date: Date): string {
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`;
}

export function makeIsoDate(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

export function isValidIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = parts(iso);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** A date in the visitor's local time zone as YYYY-MM-DD. */
export function toIsoDate(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;
}

/** Day of the week: 0 = Sunday ... 6 = Saturday. */
export function dayOfWeek(iso: string): number {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = parts(iso);
  return fromUtc(new Date(Date.UTC(y, m - 1, d + days)));
}

/**
 * Adds whole months to a YYYY-MM-DD date. If the start day does not exist in
 * the target month (e.g. Jan 31 + 1 month), the last day of that month is used.
 */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = parts(iso);
  const targetMonthIndex = m - 1 + months;
  const year = y + Math.floor(targetMonthIndex / 12);
  const month = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return makeIsoDate(year, month + 1, Math.min(d, lastDay));
}

/** True for Monday to Friday. Holidays are not taken into account. */
export function isBusinessDay(iso: string): boolean {
  const weekday = dayOfWeek(iso);
  return weekday !== 0 && weekday !== 6;
}

/**
 * The date `count` business days after `iso`, where business days are Monday
 * to Friday (holidays are ignored). With count = 1 this is the next weekday.
 */
export function addBusinessDays(iso: string, count: number): string {
  let date = iso;
  let remaining = count;
  while (remaining > 0) {
    date = addDays(date, 1);
    if (isBusinessDay(date)) remaining--;
  }
  return date;
}
