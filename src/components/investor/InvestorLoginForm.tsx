"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { investorLoginAction, type InvestorLoginState } from "@/app/portal/actions";

const inputClass =
  "mt-2 block w-full rounded-lg border bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm focus:outline-none focus:ring-2";
const okInput = "border-slate-300 focus:border-blue-700 focus:ring-blue-700/30";
const errorInput = "border-red-600 focus:ring-red-600/30";

export function InvestorLoginForm() {
  const [state, formAction, pending] = useActionState<InvestorLoginState, FormData>(investorLoginAction, {});
  const id = useId();
  const errorId = `${id}-error`;
  const invalid = state.error ? true : undefined;
  const describedBy = state.error ? errorId : undefined;

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label htmlFor={`${id}-username`} className="text-sm font-semibold text-slate-900">
          Username
        </label>
        <input
          id={`${id}-username`}
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={200}
          required
          defaultValue={state.username ?? ""}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={`${inputClass} ${state.error ? errorInput : okInput}`}
        />
      </div>
      <div>
        <label htmlFor={`${id}-password`} className="text-sm font-semibold text-slate-900">
          Password
        </label>
        <input
          id={`${id}-password`}
          name="password"
          type="password"
          autoComplete="current-password"
          maxLength={200}
          required
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={`${inputClass} ${state.error ? errorInput : okInput}`}
        />
        <p className="mt-2 text-sm">
          <Link
            href="/portal/forgot-password"
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
        className="w-full rounded-lg bg-blue-900 px-6 py-2.5 text-base font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
