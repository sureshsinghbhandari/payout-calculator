/**
 * What the calculator offers: the investment amounts, terms and payout terms,
 * with the defaults the form starts with. A Master Admin manages them in
 * Settings > Amounts and terms; until then the values in config.ts are used.
 *
 * These settings hold no rates, so they may be sent to visitors.
 */
import {
  DEFAULT_FREQUENCY,
  DEFAULT_INVESTMENT_AMOUNT,
  DEFAULT_LOCK_IN_YEARS,
  INVESTMENT_AMOUNTS,
  LOCK_IN_YEARS,
} from "./config";
import { formatDollars, formatYears } from "./format";
import { FREQUENCY_LABELS, type PayoutFrequency } from "./payout";

/** All payout terms, most frequent first. */
export const ALL_FREQUENCIES: PayoutFrequency[] = ["quarterly", "half-yearly", "yearly"];

export const PRODUCT_LIMITS = {
  /** Largest investment amount, in whole dollars. */
  maxAmount: 10_000_000,
  /** Most investment amounts that can be offered. */
  maxAmounts: 30,
  minTerm: 1,
  maxTerm: 30,
} as const;

export interface ProductSettings {
  /** Investment amounts in whole dollars, smallest first. */
  amounts: number[];
  defaultAmount: number;
  /** Terms in whole years, shortest first. */
  terms: number[];
  defaultTerm: number;
  /** Payout terms offered, most frequent first. */
  frequencies: PayoutFrequency[];
  defaultFrequency: PayoutFrequency;
}

export function defaultProductSettings(): ProductSettings {
  return {
    amounts: [...INVESTMENT_AMOUNTS],
    defaultAmount: DEFAULT_INVESTMENT_AMOUNT,
    terms: [...LOCK_IN_YEARS],
    defaultTerm: DEFAULT_LOCK_IN_YEARS,
    frequencies: [...ALL_FREQUENCIES],
    defaultFrequency: DEFAULT_FREQUENCY,
  };
}

export function isOfferedAmount(products: ProductSettings, amount: unknown): amount is number {
  return typeof amount === "number" && products.amounts.includes(amount);
}

export function isOfferedTerm(products: ProductSettings, years: unknown): years is number {
  return typeof years === "number" && products.terms.includes(years);
}

export function isOfferedFrequency(products: ProductSettings, frequency: unknown): frequency is PayoutFrequency {
  return typeof frequency === "string" && (products.frequencies as string[]).includes(frequency);
}

/** "1 or 2 years", "1, 2 or 5 years", "3 years". */
export function describeTerms(terms: readonly number[]): string {
  if (terms.length === 1) return formatYears(terms[0]).toLowerCase();
  return `${terms.slice(0, -1).join(", ")} or ${terms[terms.length - 1]} years`;
}

export type ProductField = "amounts" | "defaultAmount" | "terms" | "defaultTerm" | "frequencies" | "defaultFrequency";

export type ProductValidation =
  | { ok: true; value: ProductSettings }
  | { ok: false; errors: Partial<Record<ProductField, string>> };

const WHOLE_NUMBER = /^\d+$/;

/** One amount as typed by the admin: "25000", "25,000" or "$25,000". Null when it is not a whole-dollar amount. */
export function parseAmountText(text: string): number | null {
  const clean = text.trim().replace(/^\$/, "").replace(/,/g, "").trim();
  if (!WHOLE_NUMBER.test(clean)) return null;
  const value = Number(clean);
  return Number.isSafeInteger(value) ? value : null;
}

/** Splits the amounts box: one amount per line (blank lines are ignored). */
export function splitAmountLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && WHOLE_NUMBER.test(value.trim())) return Number(value.trim());
  return null;
}

/**
 * Validates settings from the admin form or the stored file. Amounts and terms
 * are sorted and duplicates removed; the defaults must be among the offered values.
 */
export function validateProductSettings(raw: {
  amounts: readonly unknown[];
  defaultAmount: unknown;
  terms: readonly unknown[];
  defaultTerm: unknown;
  frequencies: readonly unknown[];
  defaultFrequency: unknown;
}): ProductValidation {
  const errors: Partial<Record<ProductField, string>> = {};

  // Amounts
  const amounts: number[] = [];
  for (const entry of raw.amounts) {
    const value = typeof entry === "string" ? parseAmountText(entry) : toNumber(entry);
    if (value === null || !Number.isInteger(value)) {
      errors.amounts = `"${String(entry).slice(0, 20)}" is not a whole-dollar amount. Enter amounts like 25000 or $25,000.`;
      break;
    }
    if (value < 1 || value > PRODUCT_LIMITS.maxAmount) {
      errors.amounts = `Each amount must be between $1 and ${formatDollars(PRODUCT_LIMITS.maxAmount)}.`;
      break;
    }
    if (!amounts.includes(value)) amounts.push(value);
  }
  amounts.sort((a, b) => a - b);
  if (!errors.amounts) {
    if (amounts.length === 0) errors.amounts = "Enter at least one investment amount.";
    else if (amounts.length > PRODUCT_LIMITS.maxAmounts) {
      errors.amounts = `Offer at most ${PRODUCT_LIMITS.maxAmounts} amounts.`;
    }
  }

  // Terms
  const terms: number[] = [];
  for (const entry of raw.terms) {
    const value = toNumber(entry);
    if (value === null || !Number.isInteger(value) || value < PRODUCT_LIMITS.minTerm || value > PRODUCT_LIMITS.maxTerm) {
      errors.terms = `Each term must be a whole number of years from ${PRODUCT_LIMITS.minTerm} to ${PRODUCT_LIMITS.maxTerm}.`;
      break;
    }
    if (!terms.includes(value)) terms.push(value);
  }
  terms.sort((a, b) => a - b);
  if (!errors.terms && terms.length === 0) errors.terms = "Choose at least one term.";

  // Payout terms, kept in the usual order
  const offered = new Set(raw.frequencies.filter((f): f is string => typeof f === "string"));
  if (raw.frequencies.some((f) => typeof f !== "string" || !Object.hasOwn(FREQUENCY_LABELS, f))) {
    errors.frequencies = "Choose payout terms from the list.";
  }
  const frequencies = ALL_FREQUENCIES.filter((f) => offered.has(f));
  if (!errors.frequencies && frequencies.length === 0) errors.frequencies = "Choose at least one payout term.";

  // Defaults
  const defaultAmount = toNumber(raw.defaultAmount);
  if (!errors.amounts && (defaultAmount === null || !amounts.includes(defaultAmount))) {
    errors.defaultAmount = "Choose a default amount from the amounts offered.";
  }
  const defaultTerm = toNumber(raw.defaultTerm);
  if (!errors.terms && (defaultTerm === null || !terms.includes(defaultTerm))) {
    errors.defaultTerm = "Choose a default term from the terms offered.";
  }
  const defaultFrequency = raw.defaultFrequency;
  if (!errors.frequencies && (typeof defaultFrequency !== "string" || !(frequencies as string[]).includes(defaultFrequency))) {
    errors.defaultFrequency = "Choose a default payout term from the payout terms offered.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      amounts,
      defaultAmount: defaultAmount as number,
      terms,
      defaultTerm: defaultTerm as number,
      frequencies,
      defaultFrequency: defaultFrequency as PayoutFrequency,
    },
  };
}

// ---------- stored file ----------

export interface ProductChange {
  settings: ProductSettings;
  /** ISO timestamp (UTC). */
  savedAt: string;
}

export interface StoredProducts {
  settings: ProductSettings;
  /** ISO timestamp of the last save, or null when the defaults from config.ts are in use. */
  savedAt: string | null;
  /** Saved versions, newest first. */
  history: ProductChange[];
}

export function defaultStoredProducts(): StoredProducts {
  return { settings: defaultProductSettings(), savedAt: null, history: [] };
}

function parseSettings(data: unknown): ProductSettings | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.amounts) || !Array.isArray(d.terms) || !Array.isArray(d.frequencies)) return null;
  const result = validateProductSettings({
    amounts: d.amounts,
    defaultAmount: d.defaultAmount,
    terms: d.terms,
    defaultTerm: d.defaultTerm,
    frequencies: d.frequencies,
    defaultFrequency: d.defaultFrequency,
  });
  return result.ok ? result.value : null;
}

/** Parses the stored file. Throws if the current settings are missing or invalid. */
export function parseStoredProducts(text: string): StoredProducts {
  const data = JSON.parse(text) as { settings?: unknown; savedAt?: unknown; history?: unknown };
  const settings = parseSettings(data?.settings);
  if (!settings) throw new Error("Stored amounts and terms are invalid.");
  const history = Array.isArray(data.history)
    ? data.history.flatMap((entry: { settings?: unknown; savedAt?: unknown } | null) => {
        if (!entry || typeof entry.savedAt !== "string") return [];
        const s = parseSettings(entry.settings);
        return s ? [{ settings: s, savedAt: entry.savedAt }] : [];
      })
    : [];
  return { settings, savedAt: typeof data.savedAt === "string" ? data.savedAt : null, history };
}

/** The data to store after saving `settings`, keeping the newest `limit` history entries. */
export function nextStoredProducts(
  current: StoredProducts,
  settings: ProductSettings,
  savedAt: string,
  limit: number,
): StoredProducts {
  return {
    settings,
    savedAt,
    history: [{ settings, savedAt }, ...current.history].slice(0, limit),
  };
}

// ---------- descriptions for the audit log and history ----------

export function amountsText(amounts: readonly number[]): string {
  return amounts.map(formatDollars).join(", ");
}

export function termsText(terms: readonly number[]): string {
  return terms.join(", ") + (terms.length === 1 && terms[0] === 1 ? " year" : " years");
}

export function frequenciesText(frequencies: readonly PayoutFrequency[]): string {
  return frequencies.map((f) => FREQUENCY_LABELS[f]).join(", ");
}

/** Audit summary of a save, listing each changed setting with its old and new value. */
export function describeProductChange(before: ProductSettings | null, after: ProductSettings): string {
  const parts: string[] = [];
  const add = (label: string, from: string | null, to: string) => {
    if (from === null) parts.push(`${label} ${to}`);
    else if (from !== to) parts.push(`${label} ${from} to ${to}`);
  };
  add("amounts", before && amountsText(before.amounts), amountsText(after.amounts));
  add("default amount", before && formatDollars(before.defaultAmount), formatDollars(after.defaultAmount));
  add("terms", before && termsText(before.terms), termsText(after.terms));
  add("default term", before && formatYears(before.defaultTerm), formatYears(after.defaultTerm));
  add("payout terms", before && frequenciesText(before.frequencies), frequenciesText(after.frequencies));
  add(
    "default payout term",
    before && FREQUENCY_LABELS[before.defaultFrequency],
    FREQUENCY_LABELS[after.defaultFrequency],
  );
  if (parts.length === 0) return "Saved amounts and terms (no changes)";
  return `Changed amounts and terms: ${parts.join("; ")}`;
}
