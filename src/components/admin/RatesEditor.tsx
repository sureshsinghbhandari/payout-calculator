"use client";

import { useActionState, useId } from "react";
import { saveRatesAction, type SaveRatesState } from "@/app/admin/actions";
import { FREQUENCY_LABELS } from "@/lib/payout";
import { RATE_FREQUENCIES } from "@/lib/rates";
import type { StoredRates } from "@/lib/rates";

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatTimestamp(iso: string): string {
  return `${timestampFormatter.format(new Date(iso))} UTC`;
}

function formatRate(rate: number): string {
  return `${rate.toLocaleString("en-US", { maximumFractionDigits: 4 })}%`;
}

interface Props {
  stored: StoredRates;
  storageConfigured: boolean;
}

export function RatesEditor({ stored, storageConfigured }: Props) {
  const [state, formAction, pending] = useActionState<SaveRatesState, FormData>(saveRatesAction, {
    status: "idle",
  });
  const baseId = useId();

  return (
    <div className="space-y-6">
      <form action={formAction} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        {!storageConfigured && (
          <p className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Rate storage is not connected, so the default rates are in use and changes cannot be saved.
          </p>
        )}
        <div className="grid gap-5 sm:grid-cols-3">
          {RATE_FREQUENCIES.map((frequency) => {
            const id = `${baseId}-${frequency}`;
            const error = state.fieldErrors?.[frequency];
            return (
              <div key={frequency}>
                <label htmlFor={id} className="text-sm font-semibold text-slate-900">
                  {FREQUENCY_LABELS[frequency]}
                </label>
                <div className="relative mt-2">
                  <input
                    // Remount after a save so the inputs show the saved values.
                    key={`${stored.savedAt ?? "default"}-${frequency}`}
                    id={id}
                    name={frequency}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    required
                    defaultValue={state.values?.[frequency] ?? String(stored.rates[frequency])}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${id}-error` : undefined}
                    className={`block w-full rounded-lg border bg-white py-2.5 pl-3 pr-10 text-base tabular-nums text-slate-900 shadow-sm focus:outline-none focus:ring-2 ${
                      error
                        ? "border-red-600 focus:ring-red-600/30"
                        : "border-slate-300 focus:border-blue-700 focus:ring-blue-700/30"
                    }`}
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                  >
                    %
                  </span>
                </div>
                {error && (
                  <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-red-700">
                    {error}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-slate-500">Each rate must be between 0% and 100%, with up to 4 decimal places.</p>

        <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p
            role="status"
            className={`text-sm ${
              state.status === "error" ? "font-medium text-red-700" : state.status === "saved" ? "font-medium text-emerald-700" : "text-slate-600"
            }`}
          >
            {state.message ??
              (stored.savedAt ? `Last saved ${formatTimestamp(stored.savedAt)}.` : "Using the default rates. No changes saved yet.")}
          </p>
          <button
            type="submit"
            disabled={pending || !storageConfigured}
            className="rounded-lg bg-blue-900 px-6 py-2.5 text-base font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save rates"}
          </button>
        </div>
      </form>

      <section aria-labelledby={`${baseId}-history`} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h2 id={`${baseId}-history`} className="px-5 pt-5 text-base font-semibold text-slate-900 sm:px-8">
          Change history
        </h2>
        {stored.history.length === 0 ? (
          <p className="px-5 pb-5 pt-2 text-sm text-slate-600 sm:px-8">No changes have been saved yet.</p>
        ) : (
          <div className="relative mt-3 overflow-x-auto rounded-b-2xl">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <th scope="col" className="px-5 py-3 text-left font-semibold sm:px-8">
                    Saved
                  </th>
                  {RATE_FREQUENCIES.map((f) => (
                    <th key={f} scope="col" className="px-4 py-3 text-right font-semibold">
                      {FREQUENCY_LABELS[f]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular-nums text-slate-800">
                {stored.history.map((entry) => (
                  <tr key={entry.savedAt} className="border-b border-slate-100">
                    <td className="whitespace-nowrap px-5 py-2.5 sm:px-8">{formatTimestamp(entry.savedAt)}</td>
                    {RATE_FREQUENCIES.map((f) => (
                      <td key={f} className="px-4 py-2.5 text-right">
                        {formatRate(entry.rates[f])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
