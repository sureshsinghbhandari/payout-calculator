"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type FormEvent,
} from "react";
import { calculateQuoteAction } from "@/app/actions";
import { INVESTMENT_AMOUNTS, INVESTMENT_DATE_MAX, INVESTMENT_DATE_MIN, LOCK_IN_YEARS } from "@/lib/config";
import { effectiveInvestmentDate, initialFormState, type FormState } from "@/lib/form";
import { formatDollars, formatIsoDateLong, formatYears } from "@/lib/format";
import {
  FREQUENCY_LABELS,
  interestStartDate,
  interestStartDelayText,
  PAYOUT_TYPE_LABELS,
  toIsoDate,
  validateInvestmentDate,
  type PayoutFrequency,
  type PayoutType,
} from "@/lib/payout";
import { FREQUENCY_ORDER, type PublicScenarioSet } from "@/lib/scenarios";
import { PayoutResults } from "./PayoutResults";

const PAYOUT_TYPE_HINTS: Record<PayoutType, string> = {
  "interest-only": "Interest each period. Full principal returned at maturity.",
  "interest-and-principal": "Equal principal installments plus interest on the remaining balance.",
};

const PAYOUT_TYPES = Object.keys(PAYOUT_TYPE_LABELS) as PayoutType[];
const START_DELAY = interestStartDelayText();

const fieldClass =
  "block w-full rounded-lg border bg-white py-2.5 pl-3 text-base text-slate-900 shadow-sm transition focus:outline-none focus:ring-2";
const okFieldClass = "border-slate-300 focus:border-blue-700 focus:ring-blue-700/30";
const errorFieldClass = "border-red-600 focus:border-red-600 focus:ring-red-600/30";
const selectClass = `${fieldClass} ${okFieldClass} appearance-none pr-10`;

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

const noopSubscribe = () => () => {};

/** Today's date in the visitor's time zone; empty during server rendering. */
function useToday(): string {
  return useSyncExternalStore(noopSubscribe, () => toIsoDate(new Date()), () => "");
}

function sameInputs(form: FormState, investmentDate: string, scenarios: PublicScenarioSet | null): boolean {
  if (!scenarios) return true;
  const i = scenarios.selected.inputs;
  return (
    investmentDate === i.investmentDate &&
    form.principal === i.principal &&
    form.lockInYears === i.lockInYears &&
    form.payoutType === i.payoutType &&
    form.frequency === i.frequency
  );
}

export function PayoutCalculator() {
  const today = useToday();
  const [form, setForm] = useState<FormState>(initialFormState);
  const [dateError, setDateError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<PublicScenarioSet | null>(null);
  const [isPending, startTransition] = useTransition();
  const dateInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const focusResultsRef = useRef(false);
  const ids = {
    amount: useId(),
    date: useId(),
    dateHint: useId(),
    dateError: useId(),
    lockIn: useId(),
    frequency: useId(),
  };

  useEffect(() => {
    if (scenarios && focusResultsRef.current) {
      focusResultsRef.current = false;
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      resultsRef.current?.focus({ preventScroll: true });
    }
  }, [scenarios]);

  const investmentDate = effectiveInvestmentDate(form, today);
  const dateCheck = investmentDate ? validateInvestmentDate(investmentDate) : null;
  const startDate = dateCheck?.ok ? interestStartDate(dateCheck.value) : null;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleDateChange(value: string) {
    update("investmentDate", value);
    if (dateError) {
      const result = validateInvestmentDate(value);
      setDateError(result.ok ? null : result.error);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const date = validateInvestmentDate(investmentDate);
    if (!date.ok) {
      setDateError(date.error);
      dateInputRef.current?.focus();
      return;
    }
    setDateError(null);
    setSubmitError(null);
    const request = {
      principal: form.principal,
      lockInYears: form.lockInYears,
      payoutType: form.payoutType,
      frequency: form.frequency,
      investmentDate: date.value,
    };
    startTransition(async () => {
      let message = "The calculator is temporarily unavailable. Please try again.";
      try {
        const response = await calculateQuoteAction(request);
        if (response.ok) {
          focusResultsRef.current = true;
          setScenarios(response.result);
          return;
        }
        message = response.error;
      } catch {
        // Network failure: keep the generic message.
      }
      setSubmitError(message);
    });
  }

  function handleReset() {
    setForm(initialFormState());
    setDateError(null);
    setSubmitError(null);
    setScenarios(null);
  }

  const isStale = !sameInputs(form, investmentDate, scenarios);

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
          <div className="grid gap-6 md:grid-cols-2">
            {/* Investment amount */}
            <div>
              <label htmlFor={ids.amount} className="text-sm font-semibold text-slate-900">
                Investment amount
              </label>
              <div className="relative mt-2">
                <select
                  id={ids.amount}
                  value={form.principal}
                  onChange={(e) => update("principal", Number(e.target.value))}
                  className={`${selectClass} tabular-nums`}
                >
                  {INVESTMENT_AMOUNTS.map((amount) => (
                    <option key={amount} value={amount}>
                      {formatDollars(amount)}
                    </option>
                  ))}
                </select>
                <SelectChevron />
              </div>
            </div>

            {/* Planned investment date */}
            <div>
              <label htmlFor={ids.date} className="text-sm font-semibold text-slate-900">
                Planned investment date
              </label>
              <input
                ref={dateInputRef}
                id={ids.date}
                type="date"
                min={INVESTMENT_DATE_MIN}
                max={INVESTMENT_DATE_MAX}
                value={investmentDate}
                onChange={(e) => handleDateChange(e.target.value)}
                onBlur={() => {
                  const result = validateInvestmentDate(investmentDate);
                  setDateError(result.ok ? null : result.error);
                }}
                aria-invalid={dateError ? true : undefined}
                aria-describedby={dateError ? ids.dateError : ids.dateHint}
                className={`mt-2 pr-3 ${fieldClass} ${dateError ? errorFieldClass : okFieldClass}`}
              />
              {/* The error replaces the hint so the layout does not shift. */}
              {dateError ? (
                <p id={ids.dateError} role="alert" className="mt-1.5 text-xs font-medium leading-5 text-red-700">
                  {dateError}
                </p>
              ) : (
                <p id={ids.dateHint} className="mt-1.5 text-xs leading-5 text-slate-500">
                  {startDate
                    ? `Interest starts ${formatIsoDateLong(startDate)}, ${START_DELAY} after this date.`
                    : `Interest starts ${START_DELAY} after this date.`}
                </p>
              )}
            </div>

            {/* Term locked */}
            <div>
              <label htmlFor={ids.lockIn} className="text-sm font-semibold text-slate-900">
                Term locked
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

            {/* Payout term */}
            <div>
              <label htmlFor={ids.frequency} className="text-sm font-semibold text-slate-900">
                Payout term
              </label>
              <div className="relative mt-2">
                <select
                  id={ids.frequency}
                  value={form.frequency}
                  onChange={(e) => update("frequency", e.target.value as PayoutFrequency)}
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
            </div>
          </div>

          {/* Payout type */}
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
            Interest starts {START_DELAY} after your planned investment date, counting Monday to Friday as
            business days. The first payout falls one period after that.
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
        {submitError && (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {submitError}
          </p>
        )}
      </form>

      {scenarios && <PayoutResults ref={resultsRef} scenarios={scenarios} isStale={isStale} />}
    </div>
  );
}
