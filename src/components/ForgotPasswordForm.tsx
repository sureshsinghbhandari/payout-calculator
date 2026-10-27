"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { requestPasswordResetAction, type ResetKind, type ResetRequestState } from "@/app/forgot-password-actions";
import { SETUP_LINK_HOURS } from "@/lib/accounts";
import { inputClass, labelClass, primaryButton } from "./admin/users/ui";

/** Forgot password form, shared by the admin and investor sign-in pages. */
export function ForgotPasswordForm({ kind }: { kind: ResetKind }) {
  const [state, formAction, pending] = useActionState<ResetRequestState, FormData>(requestPasswordResetAction, {
    status: "idle",
  });
  const id = useId();
  const signInHref = kind === "admin" ? "/admin" : "/portal";
  const helpPerson = kind === "admin" ? "ask a Master Admin" : "contact our team";

  if (state.status === "sent") {
    return (
      <div className="mt-6">
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          If an account matches, we have emailed a link to set a new password. The link works once and expires after{" "}
          {SETUP_LINK_HOURS} hours. If nothing arrives within a few minutes, check your spam folder, or {helpPerson}.
        </p>
        <Link href={signInHref} className={`${primaryButton} mt-6 w-full sm:w-auto`}>
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="kind" value={kind} />
      <div>
        <label htmlFor={`${id}-identifier`} className={labelClass}>
          Username or email address
        </label>
        <input
          id={`${id}-identifier`}
          name="identifier"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={254}
          required
          defaultValue={state.identifier ?? ""}
          aria-invalid={state.fieldError ? true : undefined}
          aria-describedby={state.fieldError ? `${id}-error` : undefined}
          className={inputClass(Boolean(state.fieldError))}
        />
        {state.fieldError && (
          <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-red-700">
            {state.fieldError}
          </p>
        )}
      </div>
      {state.message && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${primaryButton} w-full`}>
        {pending ? "Sending…" : "Email me a link"}
      </button>
      <p className="text-center text-sm">
        <Link href={signInHref} className="font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
