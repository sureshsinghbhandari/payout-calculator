"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { INVESTMENT_AMOUNTS, LOCK_IN_YEARS } from "@/lib/config";
import { formatDollars, formatPercent, formatYears } from "@/lib/format";
import {
  initialFormState,
  standardRate,
  withFrequency,
  withRateText,
  withStandardRate,
  type FormState,
} from "@/lib/form";
import {
  calculatePayoutSchedule,
  FREQUENCY_LABELS,
  PAYOUT_TYPE_LABELS,
  toIsoDate,
  validateRate,
  type PayoutFrequency,
  type PayoutType,
} from "@/lib/payout";
import { buildScenarios, FREQUENCY_ORDER, type ScenarioSet } from "@/lib/scenarios";
import { PayoutResults } from "./PayoutResults";

const PAYOUT_TYPE_HINTS: Record<PayoutType, string> = {
  "interest-only": "Interest each period. Full principal returned at maturity.",
  "interest-and-principal": "Equal principal installments plus interest on the remaining balance.",
};

const PAYOUT_TYPES = Object.keys(PAYOUT_TYPE_LABELS) as PayoutType[];

const STANDARD_RATES_TEXT = FREQUENCY_ORDER.map(
  (f) => `${FREQUENCY_LABELS[f]} ${formatPercent(standardRate(f))}`,
).join(", ");

const selectClass =
  "block w-full appearance-none rounded-lg border border-slate-300 bg-white py-2.5 pl-3 pr-10 text-base text-slate-900 shadow-sm transition focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/30";

function SelectChevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500"
    >
      <path
        fillRule="evenodd"
        d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function sameInputs(form: FormState, scenarios: ScenarioSet | null): boolean {
  if (!scenarios) return true;
  const rate = validateRate(form.rateText);
  const i = scenarios.selected.inputs;
  return (
    rate.ok &&
    rate.value === i.annualRatePercent &&
    form.principal === i.principal &&
    form.lockInYears === i.lockInYears &&
    form.payoutType === i.payoutType &&
    form.frequency === i.frequency
  );
}

export function PayoutCalculator() {
  const [form, setForm] = useState<FormState>(initialFormState);
  const [rateError, setRateError] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioSet | null>(null);
  const [isPending, startTransition] = useTransition();
  const rateInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const focusResultsRef = useRef(false);
  const ids = {
    lockIn: useId(),
    frequency: useId(),
    frequencyHint: useId(),
    rate: useId(),
    rateHint: useId(),
    rateError: useId(),
  };

  useEffect(() => {
    if (scenarios && focusResultsRef.current) {
      focusResultsRef.current = false;
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      resultsRef.current?.focus({ preventScroll: true });
    }
  }, [scenarios]);

  function update<K extends "principal" | "lockInYears" | "payoutType">(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleFrequencyChange(frequency: PayoutFrequency) {
    const next = withFrequency(form, frequency);
    setForm(next);
    // The rate may have changed to a valid standard rate; refresh any error.
    if (rateError) {
      const result = validateRate(next.rateText);
      setRateError(result.ok ? null : result.error);
    }
  }

  function handleRateChange(text: string) {
    setForm((prev) => withRateText(prev, text));
    if (rateError) {
      const result = validateRate(text);
      setRateError(result.ok ? null : result.error);
    }
  }

  function handleUseStandardRate() {
    setForm((prev) => withStandardRate(prev));
    setRateError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rate = validateRate(form.rateText);
    if (!rate.ok) {
      setRateError(rate.error);
      rateInputRef.current?.focus();
      return;
    }
    setRateError(null);
    const startDate = toIsoDate(new Date());
    startTransition(() => {
      focusResultsRef.current = true;
      const selected = calculatePayoutSchedule({
        principal: form.principal,
        annualRatePercent: rate.value,
        lockInYears: form.lockInYears,
        payoutType: form.payoutType,
        frequency: form.frequency,
        startDate,
      });
      setScenarios(buildScenarios(selected));
    });
  }

  function handleReset() {
    setForm(initialFormState());
    setRateError(null);
    setScenarios(null);
  }

  const isStale = !sameInputs(form, scenarios);
  const frequencyLabel = FREQUENCY_LABELS[form.frequency];
  const standard = formatPercent(standardRate(form.frequency));

  return (
    <div className="space-y-8">
      <form
        noValidate
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"
        aria-labelledby="calculator-heading"
      >
        <div className="mb-6">
          <h2 id="calculator-heading" className="text-lg font-semibold text-slate-900">
            Your investment details
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Choose your options, then select <span className="font-medium">Calculate Payout</span>{" "}
            to see the full schedule.
          </p>
        </div>

        <div className="space-y-7">
          {/* A. Investment amount */}
          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">Investment amount</legend>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              {INVESTMENT_AMOUNTS.map((amount) => (
                <label
                  key={amount}
                  className="relative flex cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-4 text-center text-base font-semibold text-slate-800 shadow-sm transition hover:border-blue-400 has-[:checked]:border-blue-800 has-[:checked]:bg-blue-50 has-[:checked]:text-blue-900 has-[:checked]:ring-1 has-[:checked]:ring-blue-800 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-700 has-[:focus-visible]:ring-offset-2"
                >
                  <input
                    type="radio"
                    name="principal"
                    value={amount}
                    checked={form.principal === amount}
                    onChange={() => update("principal", amount)}
                    className="sr-only"
                  />
                  <span className="tabular-nums">{formatDollars(amount)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-6 md:grid-cols-3">
            {/* B. Lock-in period */}
            <div>
              <label htmlFor={ids.lockIn} className="text-sm font-semibold text-slate-900">
                Lock-in period
              </label>
              <div className="relative mt-2">
                <select
                  id={ids.lockIn}
                  value={form.lockInYears}
                  onChange={(e) => update("lockInYears", Number(e.target.value))}
                  className={selectClass}
                >
                  {LOCK_IN_YEARS.map((years) => (
                    <option key={years} value={years}>
                      {formatYears(years)}
                    </option>
                  ))}
                </select>
                <SelectChevron />
              </div>
            </div>

            {/* D. Payout period */}
            <div>
              <label htmlFor={ids.frequency} className="text-sm font-semibold text-slate-900">
                Payout period
              </label>
              <div className="relative mt-2">
                <select
                  id={ids.frequency}
                  value={form.frequency}
                  onChange={(e) => handleFrequencyChange(e.target.value as PayoutFrequency)}
                  aria-describedby={ids.frequencyHint}
                  className={selectClass}
                >
                  {FREQUENCY_ORDER.map((f) => (
                    <option key={f} value={f}>
                      {FREQUENCY_LABELS[f]}
                    </option>
                  ))}
                </select>
                <SelectChevron />
              </div>
              <p id={ids.frequencyHint} className="mt-1.5 text-xs text-slate-500">
                Standard rates: {STANDARD_RATES_TEXT}.
              </p>
            </div>

            {/* E. Annual interest rate */}
            <div>
              <label htmlFor={ids.rate} className="text-sm font-semibold text-slate-900">
                Annual interest rate
              </label>
              <div className="relative mt-2">
                <input
                  ref={rateInputRef}
                  id={ids.rate}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.rateText}
                  onChange={(e) => handleRateChange(e.target.value)}
                  onBlur={() => {
                    const result = validateRate(form.rateText);
                    setRateError(result.ok ? null : result.error);
                  }}
                  aria-invalid={rateError ? true : undefined}
                  aria-describedby={rateError ? ids.rateError : ids.rateHint}
                  className={`block w-full rounded-lg border bg-white py-2.5 pl-3 pr-10 text-base tabular-nums text-slate-900 shadow-sm transition focus:outline-none focus:ring-2 ${
                    rateError
                      ? "border-red-600 focus:border-red-600 focus:ring-red-600/30"
                      : "border-slate-300 focus:border-blue-700 focus:ring-blue-700/30"
                  }`}
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-base text-slate-500"
                >
                  %
                </span>
              </div>
              {/* The error replaces the hint so the layout does not shift. */}
              {rateError ? (
                <p id={ids.rateError} role="alert" className="mt-1.5 text-xs font-medium text-red-700">
                  {rateError}
                </p>
              ) : form.rateCustomized ? (
                <p id={ids.rateHint} className="mt-1.5 text-xs text-slate-500">
                  Custom rate. Standard {frequencyLabel} rate is {standard}.{" "}
                  <button
                    type="button"
                    onClick={handleUseStandardRate}
                    className="font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                  >
                    Use {standard}
                  </button>
                </p>
              ) : (
                <p id={ids.rateHint} className="mt-1.5 text-xs text-slate-500">
                  Standard {frequencyLabel} rate. You can change it (0% to 100%).
                </p>
              )}
            </div>
          </div>

          {/* C. Payout type */}
          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">Payout type</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {PAYOUT_TYPES.map((type) => (
                <label
                  key={type}
                  className="flex cursor-pointer gap-3 rounded-xl border border-slate-300 bg-white p-4 shadow-sm transition hover:border-blue-400 has-[:checked]:border-blue-800 has-[:checked]:bg-blue-50 has-[:checked]:ring-1 has-[:checked]:ring-blue-800 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-700 has-[:focus-visible]:ring-offset-2"
                >
                  <input
                    type="radio"
                    name="payoutType"
                    value={type}
                    checked={form.payoutType === type}
                    onChange={() => update("payoutType", type)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-blue-800 focus:outline-none"
                  />
                  <span>
                    <span className="block text-base font-semibold text-slate-900">
                      {PAYOUT_TYPE_LABELS[type]}
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-600">{PAYOUT_TYPE_HINTS[type]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="mt-8 flex flex-col gap-4 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600 sm:max-w-md">
            Payout dates are counted from the day you submit. The first payout falls one period after
            that date.
          </p>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-base font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-blue-900 px-7 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
            >
              {isPending ? "Calculating…" : "Calculate Payout"}
            </button>
          </div>
        </div>
      </form>

      {scenarios && <PayoutResults ref={resultsRef} scenarios={scenarios} isStale={isStale} />}
    </div>
  );
}
