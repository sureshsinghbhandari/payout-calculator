"use client";

import { useActionState, useId } from "react";
import { changeOwnPasswordAction, type ChangePasswordState } from "@/app/admin/actions";

const inputClass =
  "mt-2 block w-full rounded-lg border bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm focus:outline-none focus:ring-2";

export function ChangePasswordForm({ minLength }: { minLength: number }) {
  const [state, formAction, pending] = useActionState<ChangePasswordState, FormData>(changeOwnPasswordAction, {});
  const id = useId();
  const field = (name: "current" | "password") => {
    const error = state.fieldErrors?.[name];
    return {
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error ? `${id}-${name}-error` : undefined,
      className: `${inputClass} ${error ? "border-red-600 focus:ring-red-600/30" : "border-slate-300 focus:border-blue-700 focus:ring-blue-700/30"}`,
    };
  };

  return (
    <form action={formAction} className="mt-6 max-w-sm space-y-4">
      <div>
        <label htmlFor={`${id}-current`} className="text-sm font-semibold text-slate-900">
          Current password
        </label>
        <input id={`${id}-current`} name="current" type="password" autoComplete="current-password" required {...field("current")} />
        {state.fieldErrors?.current && (
          <p id={`${id}-current-error`} className="mt-1.5 text-xs font-medium text-red-700">
            {state.fieldErrors.current}
          </p>
        )}
      </div>
      <div>
        <label htmlFor={`${id}-password`} className="text-sm font-semibold text-slate-900">
          New password
        </label>
        <input
          id={`${id}-password`}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={minLength}
          required
          {...field("password")}
        />
        <p className="mt-1.5 text-xs text-slate-500">At least {minLength} characters.</p>
        {state.fieldErrors?.password && (
          <p id={`${id}-password-error`} className="mt-1 text-xs font-medium text-red-700">
            {state.fieldErrors.password}
          </p>
        )}
      </div>
      <div>
        <label htmlFor={`${id}-confirm`} className="text-sm font-semibold text-slate-900">
          Confirm new password
        </label>
        <input
          id={`${id}-confirm`}
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          className={`${inputClass} border-slate-300 focus:border-blue-700 focus:ring-blue-700/30`}
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-blue-900 px-6 py-2.5 text-base font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
