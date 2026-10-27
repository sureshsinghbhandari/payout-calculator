"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { loginAction, type LoginState } from "@/app/admin/actions";

const inputClass =
  "mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/30";

export function AdminLoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const usernameId = useId();
  const passwordId = useId();
  const errorId = useId();

  return (
    <form action={formAction} className="mt-6 max-w-sm space-y-4">
      <div>
        <label htmlFor={usernameId} className="text-sm font-semibold text-slate-900">
          Username
        </label>
        <input
          id={usernameId}
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={state.username ?? ""}
          aria-describedby={state.error ? errorId : undefined}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={passwordId} className="text-sm font-semibold text-slate-900">
          Password
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? errorId : undefined}
          className={inputClass}
        />
        <p className="mt-2 text-sm">
          <Link
            href="/admin/forgot-password"
            className="font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950"
          >
            Forgot password?
          </Link>
        </p>
      </div>
      {state.error && (
        <p id={errorId} role="alert" className="text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}
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
