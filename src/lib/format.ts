const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usdWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Formats integer cents as US dollars, e.g. 62500 -> "$625.00". */
export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

/** Formats a cents difference with an explicit sign, e.g. 100000 -> "+$1,000.00". */
export function formatSignedCents(cents: number): string {
  if (cents === 0) return usd.format(0);
  return `${cents > 0 ? "+" : "−"}${usd.format(Math.abs(cents) / 100)}`;
}

/** Formats a whole-dollar amount without cents, e.g. 50000 -> "$50,000". */
export function formatDollars(dollars: number): string {
  return usdWhole.format(dollars);
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** Formats YYYY-MM-DD as e.g. "Jan 25, 2027" without time-zone shifts. */
export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return dateFormatter.format(new Date(Date.UTC(y, m - 1, d)));
}

const longDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** Formats YYYY-MM-DD with the weekday, e.g. "Mon, Oct 26, 2026". */
export function formatIsoDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return longDateFormatter.format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatPercent(value: number): string {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 4 })}%`;
}

export function formatYears(years: number): string {
  return `${years} ${years === 1 ? "Year" : "Years"}`;
}
