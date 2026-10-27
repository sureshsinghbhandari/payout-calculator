"use client";

import { useActionState } from "react";
import type { TwoStepResetState } from "@/lib/two-step";

interface Props {
  /** Master Admin server action (users or investors). */
  action: (state: TwoStepResetState, formData: FormData) => Promise<TwoStepResetState>;
  /** Id of the admin user or investor. */
  id: string;
  name: string;
  /** Whether two-step sign-in is on. When off, only the result of a reset (if any) is shown. */
  enabled: boolean;
  buttonClass: string;
}

/** Master Admin: reset someone's two-step sign-in when they lost their phone. */
export function TwoStepResetForm({ action, id, name, enabled, buttonClass }: Props) {
  const [state, formAction, pending] = useActionState<TwoStepResetState, FormData>(action, { status: "idle" });
  // Stays mounted after a reset, so the confirmation is still shown once the page has updated.
  if (!enabled && !state.message) return null;
  return (
    <div>
      {enabled && (
        <form
          action={formAction}
          onSubmit={(e) => {
            if (
              !window.confirm(
                `Reset two-step sign-in for ${name}? Only do this when you are sure it is really them, for example after a phone call. They can then sign in with their password only until they set it up again.`,
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button type="submit" disabled={pending} className={buttonClass}>
            {pending ? "Resetting…" : "Reset two-step sign-in"}
          </button>
        </form>
      )}
      <p
        role="status"
        aria-live="polite"
        className={`mt-2 text-sm ${state.status === "error" ? "font-medium text-red-700" : "text-slate-700"} ${
          state.message ? "" : "sr-only"
        }`}
      >
        {state.message}
      </p>
    </div>
  );
}
