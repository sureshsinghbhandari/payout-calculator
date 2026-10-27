"use client";

import { useActionState, useId, useState } from "react";
import { saveProductsAction, type SaveProductsState } from "@/app/admin/settings/amounts-and-terms/actions";
import { formatDollars, formatYears } from "@/lib/format";
import { FREQUENCY_LABELS, type PayoutFrequency } from "@/lib/payout";
import {
  ALL_FREQUENCIES,
  amountsText,
  frequenciesText,
  parseAmountText,
  PRODUCT_LIMITS,
  splitAmountLines,
  termsText,
  type ProductField,
  type StoredProducts,
} from "@/lib/products";

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatTimestamp(iso: string): string {
  return `${timestampFormatter.format(new Date(iso))} UTC`;
}

const TERM_CHOICES = Array.from(
  { length: PRODUCT_LIMITS.maxTerm - PRODUCT_LIMITS.minTerm + 1 },
  (_, i) => PRODUCT_LIMITS.minTerm + i,
);

const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60";
const fieldClass =
  "block w-full rounded-lg border bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm focus:outline-none focus:ring-2";
const okFieldClass = "border-slate-300 focus:border-blue-700 focus:ring-blue-700/30";
const errorFieldClass = "border-red-600 focus:ring-red-600/30";
const choiceClass =
  "flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:border-blue-400 has-[:checked]:border-blue-800 has-[:checked]:bg-blue-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-700";

/** The amounts in the box that are valid, without duplicates, smallest first. */
function validAmounts(text: string): { amounts: number[]; invalidLines: number } {
  const amounts: number[] = [];
  let invalidLines = 0;
  for (const line of splitAmountLines(text)) {
    const value = parseAmountText(line);
    if (value === null || value < 1 || value > PRODUCT_LIMITS.maxAmount) invalidLines++;
    else if (!amounts.includes(value)) amounts.push(value);
  }
  return { amounts: amounts.sort((a, b) => a - b), invalidLines };
}

/** The chosen default while it is still offered, else the first option. */
function effectiveDefault(value: string, options: readonly string[]): string {
  return options.includes(value) ? value : (options[0] ?? "");
}

function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={id} className="mt-1.5 text-xs font-medium text-red-700">
      {error}
    </p>
  );
}

function DefaultSelect({
  id,
  label,
  name,
  value,
  onChange,
  options,
  error,
}: {
  id: string;
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-slate-900">
        {label}
      </label>
      <select
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`mt-2 ${fieldClass} ${error ? errorFieldClass : okFieldClass}`}
      >
        {options.length === 0 && <option value="">Nothing offered yet</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError id={`${id}-error`} error={error} />
    </div>
  );
}

/** Form for the amounts, terms and payout terms on offer, with their defaults. */
export function ProductsEditor({ stored, storageConfigured }: { stored: StoredProducts; storageConfigured: boolean }) {
  const [state, formAction, pending] = useActionState<SaveProductsState, FormData>(saveProductsAction, {
    status: "idle",
  });
  const settings = stored.settings;
  const [amountsInput, setAmountsInput] = useState(() => settings.amounts.map(formatDollars).join("\n"));
  const [defaultAmount, setDefaultAmount] = useState(String(settings.defaultAmount));
  const [terms, setTerms] = useState<number[]>(settings.terms);
  const [defaultTerm, setDefaultTerm] = useState(String(settings.defaultTerm));
  const [frequencies, setFrequencies] = useState<PayoutFrequency[]>(settings.frequencies);
  const [defaultFrequency, setDefaultFrequency] = useState<string>(settings.defaultFrequency);
  const baseId = useId();
  const id = (field: ProductField) => `${baseId}-${field}`;
  const errors: Partial<Record<ProductField, string>> = state.fieldErrors ?? {};

  const { amounts, invalidLines } = validAmounts(amountsInput);
  const amountOptions = amounts.map((a) => ({ value: String(a), label: formatDollars(a) }));
  const termOptions = [...terms].sort((a, b) => a - b).map((y) => ({ value: String(y), label: formatYears(y) }));
  const frequencyOptions = ALL_FREQUENCIES.filter((f) => frequencies.includes(f)).map((f) => ({
    value: f,
    label: FREQUENCY_LABELS[f],
  }));

  const toggleTerm = (years: number, on: boolean) =>
    setTerms((prev) => (on ? [...prev.filter((y) => y !== years), years] : prev.filter((y) => y !== years)));
  const toggleFrequency = (frequency: PayoutFrequency, on: boolean) =>
    setFrequencies((prev) => (on ? [...prev.filter((f) => f !== frequency), frequency] : prev.filter((f) => f !== frequency)));

  const amountsHintId = `${id("amounts")}-hint`;

  return (
    <form action={formAction} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      {!storageConfigured && (
        <p className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Storage is not connected, so the starting amounts and terms are in use and changes cannot be saved.
        </p>
      )}

      <div className="space-y-8">
        {/* Investment amounts */}
        <div>
          <label htmlFor={id("amounts")} className="text-sm font-semibold text-slate-900">
            Investment amounts
          </label>
          <p id={amountsHintId} className="mt-1 text-xs leading-5 text-slate-500">
            One amount per line, in whole dollars (for example 25000 or $25,000), up to{" "}
            {formatDollars(PRODUCT_LIMITS.maxAmount)}. At most {PRODUCT_LIMITS.maxAmounts} amounts. They are shown from
            smallest to largest.
          </p>
          <textarea
            id={id("amounts")}
            name="amounts"
            rows={Math.min(Math.max(amounts.length + 1, 5), 12)}
            value={amountsInput}
            onChange={(e) => setAmountsInput(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={errors.amounts ? true : undefined}
            aria-describedby={`${amountsHintId}${errors.amounts ? ` ${id("amounts")}-error` : ""}`}
            className={`mt-2 max-w-xs tabular-nums ${fieldClass} ${errors.amounts ? errorFieldClass : okFieldClass}`}
          />
          <FieldError id={`${id("amounts")}-error`} error={errors.amounts} />
          <p className="mt-1.5 text-xs leading-5 text-slate-600">
            {amounts.length === 0
              ? "No valid amounts yet."
              : `${amounts.length} ${amounts.length === 1 ? "amount" : "amounts"} offered: ${amountsText(amounts)}.`}
            {invalidLines > 0 &&
              ` ${invalidLines} ${invalidLines === 1 ? "line is" : "lines are"} not a valid amount and cannot be saved.`}
          </p>
        </div>

        {/* Terms */}
        <fieldset aria-describedby={errors.terms ? `${id("terms")}-error` : undefined}>
          <legend className="text-sm font-semibold text-slate-900">Terms offered (years)</legend>
          <p className="mt-1 text-xs leading-5 text-slate-500">Choose at least one.</p>
          <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-10">
            {TERM_CHOICES.map((years) => (
              <label key={years} className={`justify-center ${choiceClass}`}>
                <input
                  type="checkbox"
                  name="terms"
                  value={years}
                  checked={terms.includes(years)}
                  onChange={(e) => toggleTerm(years, e.target.checked)}
                  aria-label={formatYears(years)}
                  className="h-4 w-4 shrink-0 accent-blue-800 focus:outline-none"
                />
                <span aria-hidden="true" className="tabular-nums">
                  {years}
                </span>
              </label>
            ))}
          </div>
          <FieldError id={`${id("terms")}-error`} error={errors.terms} />
        </fieldset>

        {/* Payout terms */}
        <fieldset aria-describedby={errors.frequencies ? `${id("frequencies")}-error` : undefined}>
          <legend className="text-sm font-semibold text-slate-900">Payout terms offered</legend>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Choose at least one. The comparison of longer payout terms only shows the ones offered.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {ALL_FREQUENCIES.map((frequency) => (
              <label key={frequency} className={choiceClass}>
                <input
                  type="checkbox"
                  name="frequencies"
                  value={frequency}
                  checked={frequencies.includes(frequency)}
                  onChange={(e) => toggleFrequency(frequency, e.target.checked)}
                  className="h-4 w-4 shrink-0 accent-blue-800 focus:outline-none"
                />
                {FREQUENCY_LABELS[frequency]}
              </label>
            ))}
          </div>
          <FieldError id={`${id("frequencies")}-error`} error={errors.frequencies} />
        </fieldset>

        {/* Defaults */}
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Calculator defaults</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            What the calculator starts with, and returns to on Reset. Each must be one of the values offered.
          </p>
          <div className="mt-3 grid gap-5 sm:grid-cols-3">
            <DefaultSelect
              id={id("defaultAmount")}
              label="Default amount"
              name="defaultAmount"
              value={effectiveDefault(defaultAmount, amountOptions.map((o) => o.value))}
              onChange={setDefaultAmount}
              options={amountOptions}
              error={errors.defaultAmount}
            />
            <DefaultSelect
              id={id("defaultTerm")}
              label="Default term"
              name="defaultTerm"
              value={effectiveDefault(defaultTerm, termOptions.map((o) => o.value))}
              onChange={setDefaultTerm}
              options={termOptions}
              error={errors.defaultTerm}
            />
            <DefaultSelect
              id={id("defaultFrequency")}
              label="Default payout term"
              name="defaultFrequency"
              value={effectiveDefault(defaultFrequency, frequencyOptions.map((o) => o.value))}
              onChange={setDefaultFrequency}
              options={frequencyOptions}
              error={errors.defaultFrequency}
            />
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" className={`text-sm ${state.status === "error" ? "font-medium text-red-700" : "text-slate-600"}`}>
          {state.message ??
            (stored.savedAt
              ? `Last saved ${formatTimestamp(stored.savedAt)}.`
              : "Using the starting amounts and terms. No changes saved yet.")}
        </p>
        <button type="submit" disabled={pending || !storageConfigured} className={primaryButton}>
          {pending ? "Saving…" : "Save amounts and terms"}
        </button>
      </div>
    </form>
  );
}

/** The last saved versions, newest first. */
export function ProductsHistory({ stored }: { stored: StoredProducts }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <h2 id={headingId} className="px-5 pt-5 text-base font-semibold text-slate-900 sm:px-8">
        Change history
      </h2>
      {stored.history.length === 0 ? (
        <p className="px-5 pb-5 pt-2 text-sm text-slate-600 sm:px-8">No changes have been saved yet.</p>
      ) : (
        <div
          className="relative mt-3 overflow-x-auto rounded-b-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
          tabIndex={0}
          role="region"
          aria-label="Change history, scrolls horizontally"
        >
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <th scope="col" className="px-5 py-3 text-left font-semibold sm:px-8">
                  Saved
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold">
                  Amounts
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold">
                  Terms
                </th>
                <th scope="col" className="px-4 py-3 text-left font-semibold">
                  Payout terms
                </th>
              </tr>
            </thead>
            <tbody className="align-top tabular-nums text-slate-800">
              {stored.history.map((entry) => (
                <tr key={entry.savedAt} className="border-b border-slate-100">
                  <td className="whitespace-nowrap px-5 py-2.5 sm:px-8">{formatTimestamp(entry.savedAt)}</td>
                  <td className="px-4 py-2.5">
                    {amountsText(entry.settings.amounts)}
                    <span className="block text-xs text-slate-500">Default {formatDollars(entry.settings.defaultAmount)}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {termsText(entry.settings.terms)}
                    <span className="block text-xs text-slate-500">Default {formatYears(entry.settings.defaultTerm)}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {frequenciesText(entry.settings.frequencies)}
                    <span className="block text-xs text-slate-500">
                      Default {FREQUENCY_LABELS[entry.settings.defaultFrequency]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
