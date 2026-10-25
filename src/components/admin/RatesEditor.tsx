"use client";

import { useActionState, useId, useState } from "react";
import {
  lockRatesAction,
  saveRatesAction,
  unlockRatesAction,
  type SaveRatesState,
  type UnlockState,
} from "@/app/admin/actions";
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

function LockIcon({ open = false }: { open?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      {open ? (
        <path
          fillRule="evenodd"
          d="M14.5 1A4.5 4.5 0 0 0 10 5.5V9H3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1.5V5.5a3 3 0 1 1 6 0v2.75a.75.75 0 0 0 1.5 0V5.5A4.5 4.5 0 0 0 14.5 1Z"
          clipRule="evenodd"
        />
      ) : (
        <path
          fillRule="evenodd"
          d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z"
          clipRule="evenodd"
        />
      )}
    </svg>
  );
}

const primaryButton =
  "inline-flex items-center gap-2 rounded-lg bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60";
const secondaryButton =
  "inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700";

/** Read-only rates with an Unlock button that asks for the admin password. */
export function LockedRates({ stored, savedNotice }: { stored: StoredRates; savedNotice: boolean }) {
  const [asking, setAsking] = useState(false);
  const [state, formAction, pending] = useActionState<UnlockState, FormData>(unlockRatesAction, {});
  const passwordId = useId();

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      {savedNotice && (
        <p role="status" className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          Rates saved and locked. New calculations use them immediately.
        </p>
      )}
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <LockIcon />
        Locked
      </div>
      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        {RATE_FREQUENCIES.map((frequency) => (
          <div key={frequency} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <dt className="text-sm font-semibold text-slate-700">{FREQUENCY_LABELS[frequency]}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{formatRate(stored.rates[frequency])}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm text-slate-600">
        {stored.savedAt ? `Last saved ${formatTimestamp(stored.savedAt)}.` : "Using the default rates. No changes saved yet."}
      </p>

      <div className="mt-6 border-t border-slate-200 pt-5">
        {!asking ? (
          <button type="button" onClick={() => setAsking(true)} className={primaryButton}>
            <LockIcon open />
            Unlock to edit
          </button>
        ) : (
          <form action={formAction} className="space-y-3">
            <label htmlFor={passwordId} className="block text-sm font-semibold text-slate-900">
              Enter your admin password to unlock editing
            </label>
            <input
              id={passwordId}
              name="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              aria-invalid={state.error ? true : undefined}
              aria-describedby={state.error ? `${passwordId}-error` : undefined}
              className="block w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
            />
            {state.error && (
              <p id={`${passwordId}-error`} role="alert" className="text-sm font-medium text-red-700">
                {state.error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={pending} className={primaryButton}>
                {pending ? "Checking…" : "Unlock"}
              </button>
              <button type="button" onClick={() => setAsking(false)} className={secondaryButton}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

interface EditorProps {
  stored: StoredRates;
  storageConfigured: boolean;
  unlockMinutes: number;
}

/** Editable rates, shown only after the admin has unlocked editing. */
export function RatesEditor({ stored, storageConfigured, unlockMinutes }: EditorProps) {
  const [state, formAction, pending] = useActionState<SaveRatesState, FormData>(saveRatesAction, {
    status: "idle",
  });
  const baseId = useId();

  return (
    <div className="rounded-2xl border border-amber-300 bg-white p-5 shadow-sm sm:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
          <LockIcon open />
          Unlocked for editing (locks again after saving, or after {unlockMinutes} minutes)
        </p>
        <form action={lockRatesAction}>
          <button type="submit" className={secondaryButton}>
            <LockIcon />
            Lock
          </button>
        </form>
      </div>

      <form action={formAction}>
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
          <p role="status" className={`text-sm ${state.status === "error" ? "font-medium text-red-700" : "text-slate-600"}`}>
            {state.message ??
              (stored.savedAt ? `Last saved ${formatTimestamp(stored.savedAt)}.` : "Using the default rates. No changes saved yet.")}
          </p>
          <button type="submit" disabled={pending || !storageConfigured} className={primaryButton}>
            {pending ? "Saving…" : "Save rates"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** The last saved versions of the rates, newest first. */
export function RatesHistory({ stored }: { stored: StoredRates }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <h2 id={headingId} className="px-5 pt-5 text-base font-semibold text-slate-900 sm:px-8">
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
  );
}
