"use client";

import { useActionState, useId } from "react";
import { setPayoutEmailsAction, type PayoutEmailsState } from "@/app/portal/payout-email-actions";

/**
 * The investor's choice of payout emails: a reminder a few days before each
 * payout and a confirmation when a payout is paid.
 */
export function PayoutEmailsForm({ on, email }: { on: boolean; email: string }) {
  const [state, formAction, pending] = useActionState<PayoutEmailsState, FormData>(setPayoutEmailsAction, {});
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id={headingId} className="text-base font-semibold text-slate-900">
            Payout emails{" "}
            <span
              className={`ml-1 rounded-full px-2.5 py-0.5 align-middle text-xs font-semibold ${
                on ? "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200" : "bg-slate-100 text-slate-700"
              }`}
            >
              {on ? "On" : "Off"}
            </span>
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {on ? (
              <>
                We email you at <span className="break-all font-medium text-slate-800">{email}</span> a few days before
                each payout and when a payout has been paid.
              </>
            ) : (
              "We do not email you about your payouts. Your payout schedule is always here in the portal."
            )}
          </p>
        </div>
        <form action={formAction} className="shrink-0">
          <input type="hidden" name="payoutEmails" value={on ? "off" : "on"} />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex w-full items-center justify-center rounded-lg border border-blue-900 bg-white px-4 py-2.5 text-sm font-semibold text-blue-900 shadow-sm hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
          >
            {pending ? "Saving…" : on ? "Switch off payout emails" : "Switch on payout emails"}
          </button>
        </form>
      </div>
      <p
        role="status"
        aria-live="polite"
        className={`text-sm font-medium ${state.status === "error" ? "text-red-700" : "text-emerald-800"} ${
          state.message ? "mt-3" : "sr-only"
        }`}
      >
        {state.message}
      </p>
    </section>
  );
}
