"use client";

import { useActionState, useId } from "react";
import { setTemporaryPasswordAction, type TemporaryPasswordState } from "@/app/admin/settings/users/actions";
import { inputClass, labelClass, primaryButton, secondaryButton } from "./ui";

interface Props {
  userId: string;
  name: string;
  username: string;
  minPasswordLength: number;
  onClose: () => void;
}

/** Lets a Master Admin set a temporary password that the user must change at their next sign-in. */
export function TemporaryPasswordForm({ userId, name, username, minPasswordLength, onClose }: Props) {
  const [state, formAction, pending] = useActionState<TemporaryPasswordState, FormData>(setTemporaryPasswordAction, {
    status: "idle",
  });
  const baseId = useId();
  const passwordId = `${baseId}-password`;
  const confirmId = `${baseId}-confirm`;
  const helpId = `${baseId}-help`;

  if (state.status === "ok") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p role="status" className="text-sm font-medium text-emerald-800">
          {state.message}
        </p>
        <button type="button" onClick={onClose} className={`${secondaryButton} mt-3`}>
          Done
        </button>
      </div>
    );
  }

  const passwordError = state.fieldErrors?.password;
  const confirmError = state.fieldErrors?.confirm;
  const formError = state.status === "error" && !passwordError && !confirmError ? state.message : undefined;

  return (
    <form action={formAction} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <input type="hidden" name="id" value={userId} />
      {/* Lets password managers file the new password under the right account. */}
      <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
      <p className="text-sm font-semibold text-slate-900">Set a temporary password for {name}</p>
      <p id={helpId} className="mt-1 text-sm text-slate-600">
        At least {minPasswordLength} characters. {name} is signed out and must choose a new password at their next
        sign-in. Share the temporary password privately.
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={passwordId} className={labelClass}>
            Temporary password
          </label>
          <input
            id={passwordId}
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={minPasswordLength}
            autoFocus
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={passwordError ? `${passwordId}-error ${helpId}` : helpId}
            className={inputClass(Boolean(passwordError))}
          />
          {passwordError && (
            <p id={`${passwordId}-error`} role="alert" className="mt-1.5 text-xs font-medium text-red-700">
              {passwordError}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={confirmId} className={labelClass}>
            Confirm temporary password
          </label>
          <input
            id={confirmId}
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={minPasswordLength}
            aria-invalid={confirmError ? true : undefined}
            aria-describedby={confirmError ? `${confirmId}-error` : undefined}
            className={inputClass(Boolean(confirmError))}
          />
          {confirmError && (
            <p id={`${confirmId}-error`} role="alert" className="mt-1.5 text-xs font-medium text-red-700">
              {confirmError}
            </p>
          )}
        </div>
      </div>
      {formError && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-700">
          {formError}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Saving…" : "Set temporary password"}
        </button>
        <button type="button" onClick={onClose} className={secondaryButton}>
          Cancel
        </button>
      </div>
    </form>
  );
}
