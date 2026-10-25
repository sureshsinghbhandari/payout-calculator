/**
 * The table of annual interest rates (percent) by payout frequency.
 * Rates are managed by an admin and are never shown to visitors.
 */
import { DEFAULT_RATE_BY_FREQUENCY } from "./config";
import { FREQUENCY_LABELS, validateRate, type PayoutFrequency } from "./payout";

export type RateTable = Record<PayoutFrequency, number>;

export const RATE_FREQUENCIES: PayoutFrequency[] = ["quarterly", "half-yearly", "yearly"];

export function defaultRateTable(): RateTable {
  return { ...DEFAULT_RATE_BY_FREQUENCY };
}

export type RateTableValidation =
  | { ok: true; value: RateTable }
  | { ok: false; errors: Partial<Record<PayoutFrequency, string>> };

/** Validates raw rate inputs (form text or numbers) for every frequency. */
export function validateRateTable(raw: Partial<Record<PayoutFrequency, unknown>>): RateTableValidation {
  const value = {} as RateTable;
  const errors: Partial<Record<PayoutFrequency, string>> = {};
  for (const frequency of RATE_FREQUENCIES) {
    const input = raw[frequency];
    const result =
      typeof input === "string" || typeof input === "number"
        ? validateRate(input)
        : ({ ok: false, error: "Enter an annual interest rate." } as const);
    if (result.ok) value[frequency] = result.value;
    else errors[frequency] = `${FREQUENCY_LABELS[frequency]}: ${result.error}`;
  }
  return Object.keys(errors).length === 0 ? { ok: true, value } : { ok: false, errors };
}

export interface RateChange {
  rates: RateTable;
  /** ISO timestamp (UTC). */
  savedAt: string;
}

export interface StoredRates {
  rates: RateTable;
  /** ISO timestamp of the last save, or null when the default rates are in use. */
  savedAt: string | null;
  /** Saved versions, newest first. */
  history: RateChange[];
}

export function defaultStoredRates(): StoredRates {
  return { rates: defaultRateTable(), savedAt: null, history: [] };
}

/** Parses the stored rates file. Throws if the current rates are missing or invalid. */
export function parseStoredRates(text: string): StoredRates {
  const data = JSON.parse(text) as { rates?: unknown; savedAt?: unknown; history?: unknown };
  const rates = validateRateTable((data?.rates ?? {}) as Record<string, unknown>);
  if (!rates.ok) throw new Error("Stored interest rates are invalid.");
  const history = Array.isArray(data.history)
    ? data.history.flatMap((entry: { rates?: unknown; savedAt?: unknown } | null) => {
        if (!entry || typeof entry.savedAt !== "string") return [];
        const r = validateRateTable((entry.rates ?? {}) as Record<string, unknown>);
        return r.ok ? [{ rates: r.value, savedAt: entry.savedAt }] : [];
      })
    : [];
  return {
    rates: rates.value,
    savedAt: typeof data.savedAt === "string" ? data.savedAt : null,
    history,
  };
}

/** The data to store after saving `rates`, keeping the newest `limit` history entries. */
export function nextStoredRates(current: StoredRates, rates: RateTable, savedAt: string, limit: number): StoredRates {
  const clean = Object.fromEntries(RATE_FREQUENCIES.map((f) => [f, rates[f]])) as RateTable;
  return {
    rates: clean,
    savedAt,
    history: [{ rates: clean, savedAt }, ...current.history].slice(0, limit),
  };
}
