"use client";

import { useActionState, useId } from "react";
import { loginAction, type LoginState } from "@/app/admin/actions";

export function AdminLoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const passwordId = useId();
  const errorId = useId();

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label htmlFor={passwordId} className="text-sm font-semibold text-slate-900">
          Admin password
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? errorId : undefined}
          className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
        />
        {state.error && (
          <p id={errorId} role="alert" className="mt-2 text-sm font-medium text-red-700">
            {state.error}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-blue-900 px-6 py-2.5 text-base font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
