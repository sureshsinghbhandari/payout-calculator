"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { setPasswordFromLinkAction, type SetupPasswordState } from "@/app/setup/actions";
import { SETUP_LINK_HOURS } from "@/lib/accounts";
import { inputClass, labelClass, primaryButton } from "./ui";

interface Props {
  token: string;
  name: string;
  username: string;
  minPasswordLength: number;
}

/** The form on /setup?token=…, used by admin users and investors to set their own password. */
export function SetupPasswordForm({ token, name, username, minPasswordLength }: Props) {
  const [state, formAction, pending] = useActionState<SetupPasswordState, FormData>(
    async (prev, formData) => {
      const next = await setPasswordFromLinkAction(prev, formData);
      // The link cannot be used again: keep it out of the address bar and history.
      if (next.status === "done" || next.status === "invalid-link") window.history.replaceState(null, "", "/setup");
      return next;
    },
    { status: "idle" },
  );
  const baseId = useId();
  const passwordId = `${baseId}-password`;
  const confirmId = `${baseId}-confirm`;
  const helpId = `${baseId}-help`;

  if (state.status === "done") {
    const isAdmin = state.kind === "admin";
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Your password is set</h1>
        <p role="status" className="mt-2 text-sm text-slate-600">
          You can now sign in with your username <span className="font-mono font-semibold text-slate-900">{state.username}</span>{" "}
          and your new password.
        </p>
        <Link href={isAdmin ? "/admin" : "/portal"} className={`${primaryButton} mt-6 w-full sm:w-auto`}>
          {isAdmin ? "Go to admin sign-in" : "Go to investor sign-in"}
        </Link>
      </div>
    );
  }

  if (state.status === "invalid-link") {
    return <InvalidSetupLink message={state.message} />;
  }

  const passwordError = state.fieldErrors?.password;
  const confirmError = state.fieldErrors?.confirm;
  const formError = state.status === "error" && !passwordError && !confirmError ? state.message : undefined;

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Set your password</h1>
      <p className="mt-1 text-sm text-slate-600">
        For <span className="font-semibold text-slate-900">{name}</span> (
        <span className="font-mono text-slate-900">{username}</span>)
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        <input type="hidden" name="token" value={token} />
        {/* Lets password managers save the new password under the right username. */}
        <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
        <div>
          <label htmlFor={passwordId} className={labelClass}>
            New password
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
          <p id={helpId} className="mt-1.5 text-xs text-slate-500">
            At least {minPasswordLength} characters. A short sentence you can remember works well.
          </p>
        </div>
        <div>
          <label htmlFor={confirmId} className={labelClass}>
            Confirm new password
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
        {formError && (
          <p role="alert" className="text-sm font-medium text-red-700">
            {formError}
          </p>
        )}
        <button type="submit" disabled={pending} className={`${primaryButton} w-full`}>
          {pending ? "Saving…" : "Set password"}
        </button>
      </form>
    </div>
  );
}

/** Shown for a missing, expired, used or replaced setup link. */
export function InvalidSetupLink({ message }: { message?: string }) {
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">This link cannot be used</h1>
      <p role="alert" className="mt-2 text-sm text-slate-600">
        {message ??
          `Setup links work once and expire after ${SETUP_LINK_HOURS} hours. Ask an administrator to send you a new link.`}
      </p>
    </div>
  );
}
