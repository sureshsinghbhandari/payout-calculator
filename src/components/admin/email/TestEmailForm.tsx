"use client";

import { useActionState, useId } from "react";
import { sendTestEmailAction, type TestEmailState } from "@/app/admin/email-actions";

export function TestEmailForm() {
  const [state, formAction, pending] = useActionState<TestEmailState, FormData>(sendTestEmailAction, { status: "idle" });
  const id = useId();
  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor={`${id}-to`} className="text-sm font-semibold text-slate-900">
          Send a test email to
        </label>
        <input
          id={`${id}-to`}
          name="to"
          type="email"
          required
          autoComplete="email"
          defaultValue={state.to}
          placeholder="name@example.com"
          className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-blue-900 px-5 py-2.5 text-base font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Sending…" : "Send test"}
      </button>
      {state.message && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`text-sm font-medium sm:basis-full ${state.status === "error" ? "text-red-700" : "text-emerald-700"}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
