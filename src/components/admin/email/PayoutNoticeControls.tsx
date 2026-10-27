"use client";

import { useActionState, useId } from "react";
import {
  runPayoutRemindersAction,
  saveReminderDaysAction,
  type ReminderDaysState,
  type RunRemindersState,
} from "@/app/admin/settings/email/actions";
import { MAX_REMINDER_DAYS } from "@/lib/payout-notices";
import { labelClass, primaryButton, secondaryButton } from "../users/ui";

/** The reminder days setting (0 = off). */
export function ReminderDaysForm({ days, storageConfigured }: { days: number; storageConfigured: boolean }) {
  const [state, formAction, pending] = useActionState<ReminderDaysState, FormData>(saveReminderDaysAction, {});
  const id = useId();
  const invalid = state.status === "error";
  return (
    <form action={formAction} className="space-y-2">
      <label htmlFor={`${id}-days`} className={labelClass}>
        Days before each payout
      </label>
      <div className="flex flex-wrap items-start gap-3">
        <input
          id={`${id}-days`}
          name="days"
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_REMINDER_DAYS}
          step={1}
          required
          defaultValue={state.days ?? String(days)}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={`${id}-help ${id}-status`}
          className={`block w-28 rounded-lg border bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm focus:outline-none focus:ring-2 ${
            invalid ? "border-red-600 focus:ring-red-600/30" : "border-slate-300 focus:border-blue-700 focus:ring-blue-700/30"
          }`}
        />
        <button type="submit" disabled={pending || !storageConfigured} className={primaryButton}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <p id={`${id}-help`} className="text-xs text-slate-500">
        0 to {MAX_REMINDER_DAYS}. Enter 0 to switch reminders off. Payment confirmations are chosen each time a payout
        is marked as paid.
      </p>
      <p
        id={`${id}-status`}
        role="status"
        aria-live="polite"
        className={`text-sm font-medium ${invalid ? "text-red-700" : "text-emerald-800"} ${state.message ? "" : "sr-only"}`}
      >
        {state.message}
      </p>
    </form>
  );
}

/** Runs the payout reminder job now (the same job as the daily run). */
export function RunRemindersButton({ disabled }: { disabled: boolean }) {
  const [state, formAction, pending] = useActionState<RunRemindersState, FormData>(runPayoutRemindersAction, {});
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <button type="submit" disabled={pending || disabled} className={secondaryButton}>
        {pending ? "Running…" : "Run now"}
      </button>
      <p
        role="status"
        aria-live="polite"
        className={`text-sm font-medium ${state.status === "error" ? "text-red-700" : "text-slate-700"} ${
          state.message ? "" : "sr-only"
        }`}
      >
        {state.message}
      </p>
    </form>
  );
}
