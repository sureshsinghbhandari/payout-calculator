/**
 * US federal holidays, for any year. Covers the standard 11 holidays
 * observed by federal employees, including the OPM rule that shifts a
 * fixed-date holiday off a weekend: to the preceding Friday if it falls on a
 * Saturday, to the following Monday if it falls on a Sunday.
 */
import { addDays, dayOfWeek, makeIsoDate } from "./dates";

/** Fixed-date holidays as [month, day]; each is subject to weekend shifting. */
const FIXED_DATE_HOLIDAYS: Array<[month: number, day: number]> = [
  [1, 1], // New Year's Day
  [6, 19], // Juneteenth
  [7, 4], // Independence Day
  [11, 11], // Veterans Day
  [12, 25], // Christmas Day
];

/** Shifts a fixed-date holiday off a weekend per the OPM observed-date rule. */
function observedDate(iso: string): string {
  const weekday = dayOfWeek(iso);
  if (weekday === 6) return addDays(iso, -1); // Saturday -> preceding Friday
  if (weekday === 0) return addDays(iso, 1); // Sunday -> following Monday
  return iso;
}

/** The last day of `month` in `year`, as YYYY-MM-DD. */
function lastDayOfMonth(year: number, month: number): string {
  const firstOfNextMonth = month === 12 ? makeIsoDate(year + 1, 1, 1) : makeIsoDate(year, month + 1, 1);
  return addDays(firstOfNextMonth, -1);
}

/** The date of the nth occurrence (1-based) of `weekday` (0 = Sunday ... 6 = Saturday) in `month` of `year`. */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): string {
  const firstWeekday = dayOfWeek(makeIsoDate(year, month, 1));
  const dayOfFirstOccurrence = 1 + ((weekday - firstWeekday + 7) % 7);
  return makeIsoDate(year, month, dayOfFirstOccurrence + (n - 1) * 7);
}

/** The date of the last occurrence of `weekday` in `month` of `year`. */
function lastWeekdayOfMonth(year: number, month: number, weekday: number): string {
  const last = lastDayOfMonth(year, month);
  const diff = (dayOfWeek(last) - weekday + 7) % 7;
  return addDays(last, -diff);
}

/** The 11 standard US federal holiday dates (observed) that fall in `year`. */
function federalHolidaysInYear(year: number): string[] {
  const dates = FIXED_DATE_HOLIDAYS.map(([month, day]) => observedDate(makeIsoDate(year, month, day)));
  // New Year's Day of the following year can be observed on Dec 31 of this year.
  dates.push(observedDate(makeIsoDate(year + 1, 1, 1)));
  dates.push(nthWeekdayOfMonth(year, 1, 1, 3)); // Martin Luther King Jr. Day: 3rd Monday of January
  dates.push(nthWeekdayOfMonth(year, 2, 1, 3)); // Washington's Birthday: 3rd Monday of February
  dates.push(lastWeekdayOfMonth(year, 5, 1)); // Memorial Day: last Monday of May
  dates.push(nthWeekdayOfMonth(year, 9, 1, 1)); // Labor Day: 1st Monday of September
  dates.push(nthWeekdayOfMonth(year, 10, 1, 2)); // Columbus Day: 2nd Monday of October
  dates.push(nthWeekdayOfMonth(year, 11, 4, 4)); // Thanksgiving: 4th Thursday of November
  return dates;
}

/** True if `iso` is a US federal holiday (its officially observed date). */
export function isUSFederalHoliday(iso: string): boolean {
  const year = Number(iso.slice(0, 4));
  return federalHolidaysInYear(year).includes(iso);
}
