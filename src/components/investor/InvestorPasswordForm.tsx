"use client";

import { useActionState, useId } from "react";
import { investorChangePasswordAction, type InvestorPasswordState } from "@/app/portal/actions";

const inputClass =
  "mt-2 block w-full rounded-lg border bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm focus:outline-none focus:ring-2";
const okInput = "border-slate-300 focus:border-blue-700 focus:ring-blue-700/30";
const errorInput = "border-red-600 focus:ring-red-600/30";

type Field = "current" | "password" | "confirm";

interface Props {
  /** The investor's username, for password managers (not submitted). */
  username: string;
  minLength: number;
  submitLabel: string;
}

export function InvestorPasswordForm({ username, minLength, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState<InvestorPasswordState, FormData>(
    investorChangePasswordAction,
    {},
  );
  const id = useId();
  const hintId = `${id}-password-hint`;
  const fieldErrorText = state.fieldErrors ? Object.values(state.fieldErrors).join(" ") : "";

  function fieldProps(name: Field, extraDescribedBy?: string) {
    const error = state.fieldErrors?.[name];
    const describedBy = [extraDescribedBy, error ? `${id}-${name}-error` : undefined].filter(Boolean).join(" ");
    return {
      id: `${id}-${name}`,
      name,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": describedBy || undefined,
      className: `${inputClass} ${error ? errorInput : okInput}`,
    };
  }

  function fieldError(name: Field) {
    const error = state.fieldErrors?.[name];
    return error ? (
      <p id={`${id}-${name}-error`} className="mt-1.5 text-xs font-medium text-red-700">
        {error}
      </p>
    ) : null;
  }

  return (
    <form action={formAction} className="mt-6 max-w-sm space-y-4">
      {/* Lets password managers save the new password against the right account. Not submitted. */}
      <input type="text" autoComplete="username" value={username} readOnly hidden />
      <div>
        <label htmlFor={`${id}-current`} className="text-sm font-semibold text-slate-900">
          Current password
        </label>
        <input type="password" autoComplete="current-password" maxLength={200} required {...fieldProps("current")} />
        {fieldError("current")}
      </div>
      <div>
        <label htmlFor={`${id}-password`} className="text-sm font-semibold text-slate-900">
          New password
        </label>
        <input
          type="password"
          autoComplete="new-password"
          minLength={minLength}
          maxLength={200}
          required
          {...fieldProps("password", hintId)}
        />
        <p id={hintId} className="mt-1.5 text-xs text-slate-500">
          At least {minLength} characters.
        </p>
        {fieldError("password")}
      </div>
      <div>
        <label htmlFor={`${id}-confirm`} className="text-sm font-semibold text-slate-900">
          Confirm new password
        </label>
        <input type="password" autoComplete="new-password" maxLength={200} required {...fieldProps("confirm")} />
        {fieldError("confirm")}
      </div>
      {state.error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}
      {/* Announces field errors to screen readers; they are shown visually under each field. */}
      {!state.error && fieldErrorText && (
        <p role="alert" className="sr-only">
          {fieldErrorText}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-blue-900 px-6 py-2.5 text-base font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
