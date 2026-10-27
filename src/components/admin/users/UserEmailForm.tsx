"use client";

import { useActionState, useId } from "react";
import { setUserEmailAction, type UserEmailState } from "@/app/admin/settings/users/actions";
import { secondaryButton } from "./ui";

/** Master Admin: set or remove another user's email address. */
export function UserEmailForm({ userId, email }: { userId: string; email: string | null }) {
  const [state, formAction, pending] = useActionState<UserEmailState, FormData>(setUserEmailAction, { status: "idle" });
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;

  return (
    <form action={formAction} className="space-y-1.5" noValidate>
      <input type="hidden" name="id" value={userId} />
      <label htmlFor={`${id}-email`} className="block text-xs font-semibold text-slate-700">
        Email address
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          // Shows the saved address again after a successful save.
          key={email ?? ""}
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="off"
          spellCheck={false}
          maxLength={254}
          defaultValue={state.status === "error" ? state.email : (email ?? "")}
          placeholder="name@example.com"
          aria-invalid={state.fieldError ? true : undefined}
          aria-describedby={state.fieldError ? `${errorId} ${helpId}` : helpId}
          className={`block w-full min-w-0 rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 sm:max-w-xs ${
            state.fieldError ? "border-red-600 focus:ring-red-600/30" : "border-slate-300 focus:border-blue-700 focus:ring-blue-700/30"
          }`}
        />
        <button type="submit" disabled={pending} className={`${secondaryButton} shrink-0 self-start sm:self-auto`}>
          {pending ? "Saving…" : "Save email"}
        </button>
      </div>
      <p id={helpId} className="text-xs text-slate-500">
        Used for new inquiry alerts and for Forgot password. Leave it empty to remove it.
      </p>
      <p
        id={errorId}
        role="status"
        aria-live="polite"
        className={`text-sm ${state.status === "error" ? "font-medium text-red-700" : "text-slate-700"} ${state.message ? "" : "sr-only"}`}
      >
        {state.message}
      </p>
    </form>
  );
}
