/**
 * Number formatting shared by the Trading dashboard views (server and client
 * components alike; no server-only imports here). Amounts are in the tab's
 * currency (USD for US tabs, INR for India tabs), net of broker charges, as
 * the other app reports them.
 */

/** An amount as whole currency units, e.g. "$12,340" or "-$627"; an em dash for null. */
export function money(value: number | null | undefined, currency: string, fractionDigits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  } catch {
    return value.toLocaleString("en-US", { maximumFractionDigits: fractionDigits });
  }
}

/** A signed amount: "+$410" / "-$627" (zero stays "$0"). */
export function signedMoney(value: number | null | undefined, currency: string, fractionDigits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const text = money(Math.abs(value), currency, fractionDigits);
  return value > 0 ? `+${text}` : value < 0 ? `-${text}` : text;
}

/** A fraction as a percentage: 0.123 -> "12.3%". */
export function percent(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(digits)}%`;
}

export function ratio(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : value.toFixed(2);
}

export function whole(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : value.toLocaleString("en-US");
}

/** A plain number with fixed decimals: 73.5 -> "73.5". */
export function number(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Tailwind text color for a P&L figure: green above zero, red below, slate at zero / unknown. */
export function pnlClass(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return "text-slate-700";
  return value > 0 ? "text-emerald-700" : "text-red-700";
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-10" -> "October 2026" (the Excel sheet's name); the key itself when it is not a month. */
export function monthTitle(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const index = Number(m[2]) - 1;
  return index >= 0 && index < 12 ? `${MONTH_NAMES[index]} ${m[1]}` : month;
}

/** "2026-10" -> "Oct 2026". */
export function monthShort(month: string): string {
  const title = monthTitle(month);
  return title === month ? month : `${title.slice(0, 3)} ${title.slice(-4)}`;
}

/** "YYYY-MM-DD" -> "Thu 01 Oct 2026" (the month sheet's date format), without time-zone shifts. */
export function sheetDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

/** The ladder-step words the other app uses: 14 -> "OTM+14", -2 -> "ITM-2", 0 -> "ATM". */
export function stepLabel(steps: number | null | undefined): string | null {
  if (steps === null || steps === undefined || !Number.isFinite(steps)) return null;
  if (steps === 0) return "ATM";
  return steps > 0 ? `OTM+${steps}` : `ITM${steps}`;
}
