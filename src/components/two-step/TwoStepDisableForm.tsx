"use client";

import { useActionState, useId, useState } from "react";
import type { TwoStepDisableState } from "@/lib/two-step";
import { dangerButton, errorNotice, inputClass, secondaryButton } from "./styles";
import { CodeField } from "./ui";

interface Props {
  action: (state: TwoStepDisableState, formData: FormData) => Promise<TwoStepDisableState>;
  /** The person's username, for password managers (not submitted). */
  username: string;
  /** Extra line under the button, e.g. that Master Admins must set it up again. */
  note?: string;
}

/** Turning two-step sign-in off: needs the current password and a code (or a recovery code). */
export function TwoStepDisableForm({ action, username, note }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<TwoStepDisableState, FormData>(action, { status: "idle" });
  const id = useId();
  const currentError = state.fieldErrors?.current;
  const fieldErrorText = state.fieldErrors ? Object.values(state.fieldErrors).join(" ") : "";

  if (!open) {
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)} className={secondaryButton}>
          Turn off two-step sign-in
        </button>
        {note && <p className="mt-2 text-xs text-slate-500">{note}</p>}
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="max-w-sm space-y-4"
      onSubmit={(e) => {
        if (!window.confirm("Turn off two-step sign-in? Your account is then protected by your password only.")) {
          e.preventDefault();
        }
      }}
    >
      <h3 className="text-sm font-semibold text-slate-900">Turn off two-step sign-in</h3>
      {note && <p className="text-sm text-slate-600">{note}</p>}
      {/* Lets password managers fill the right account. Not submitted. */}
      <input type="text" autoComplete="username" value={username} readOnly hidden />
      <div>
        <label htmlFor={`${id}-current`} className="text-sm font-semibold text-slate-900">
          Current password
        </label>
        <input
          id={`${id}-current`}
          name="current"
          type="password"
          autoComplete="current-password"
          maxLength={200}
          required
          aria-invalid={currentError ? true : undefined}
          aria-describedby={currentError ? `${id}-current-error` : undefined}
          className={inputClass(currentError)}
        />
        {currentError && (
          <p id={`${id}-current-error`} className="mt-1.5 text-xs font-medium text-red-700">
            {currentError}
          </p>
        )}
      </div>
      <CodeField id={`${id}-code`} error={state.fieldErrors?.code} allowRecovery />
      {state.message && (
        <p role="alert" className={errorNotice}>
          {state.message}
        </p>
      )}
      {/* Announces field errors to screen readers; they are shown under each field. */}
      {!state.message && fieldErrorText && (
        <p role="alert" className="sr-only">
          {fieldErrorText}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={dangerButton}>
          {pending ? "Turning off…" : "Turn off"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={secondaryButton}>
          Cancel
        </button>
      </div>
    </form>
  );
}
