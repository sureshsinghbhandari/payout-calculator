"use client";

import { useActionState, useId } from "react";
import type { TwoStepCodeState } from "@/lib/two-step";
import { primaryButton } from "./styles";
import { CodeField, SubmitButton } from "./ui";

interface Props {
  /** Checks the code and starts the session (admin or portal server action). */
  action: (state: TwoStepCodeState, formData: FormData) => Promise<TwoStepCodeState>;
  /** Forgets the pending sign-in, back to the password form. */
  cancelAction: () => Promise<void>;
}

/** Second step of signing in: the code from the authenticator app, or a recovery code. */
export function TwoStepSignInForm({ action, cancelAction }: Props) {
  const [state, formAction, pending] = useActionState<TwoStepCodeState, FormData>(action, {});
  const id = useId();

  return (
    <div className="mt-6 max-w-sm">
      <form action={formAction} className="space-y-4">
        <CodeField id={`${id}-code`} error={state.error} allowRecovery />
        {/* Announces the error; it is shown under the field. */}
        <p role="alert" className="sr-only">
          {state.error ?? ""}
        </p>
        <button type="submit" disabled={pending} className={`w-full sm:w-auto ${primaryButton}`}>
          {pending ? "Checking…" : "Verify and sign in"}
        </button>
      </form>
      <form action={cancelAction} className="mt-6 border-t border-slate-200 pt-4">
        <SubmitButton
          label="Start again"
          pendingLabel="Going back…"
          className="text-sm font-semibold text-slate-600 underline underline-offset-2 hover:text-slate-900"
        />
      </form>
    </div>
  );
}
